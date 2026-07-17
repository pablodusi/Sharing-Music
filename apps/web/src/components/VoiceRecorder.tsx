"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Square, Trash2, Send } from "lucide-react";
import { formatDuration } from "@/lib/format";
import { musicDucker } from "@/lib/music-ducker";

type VoiceRecorderProps = {
  disabled?: boolean;
  /** Audio blob ready to upload to the API (no optimistic local chat). */
  onSend: (blob: Blob, durationMs: number) => void;
  /** true while recording or previewing (composer should yield space). */
  onBusyChange?: (busy: boolean) => void;
};

type Phase = "idle" | "recording" | "preview";

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

/**
 * WhatsApp-style recorder: mic → record → stop → preview → send / cancel.
 * Requests microphone permission only when recording starts.
 * Ducks local music for the "recording" reason while capturing.
 */
export function VoiceRecorder({
  disabled,
  onSend,
  onBusyChange,
}: VoiceRecorderProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDurationMs, setPreviewDurationMs] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const elapsedRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const recordedBlobRef = useRef<Blob | null>(null);
  const recordingDuckHeldRef = useRef(false);

  function holdRecordingDuck() {
    if (recordingDuckHeldRef.current) {
      return;
    }
    recordingDuckHeldRef.current = true;
    musicDucker.acquire("recording");
  }

  function releaseRecordingDuck() {
    if (!recordingDuckHeldRef.current) {
      return;
    }
    recordingDuckHeldRef.current = false;
    musicDucker.release("recording");
  }

  function clearTimer() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = undefined;
    }
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function revokePreviewUrl(url: string | null) {
    if (url) {
      URL.revokeObjectURL(url);
    }
  }

  function resetToIdle(revoke = true) {
    clearTimer();
    stopStream();
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
    if (revoke) {
      revokePreviewUrl(previewUrlRef.current);
    }
    previewUrlRef.current = null;
    recordedBlobRef.current = null;
    chunksRef.current = [];
    mediaRecorderRef.current = null;
    releaseRecordingDuck();
    setPreviewUrl(null);
    setElapsedMs(0);
    elapsedRef.current = 0;
    setPreviewDurationMs(0);
    setPreviewPlaying(false);
    setPhase("idle");
  }

  useEffect(() => {
    onBusyChange?.(phase !== "idle");
  }, [phase, onBusyChange]);

  useEffect(() => {
    return () => {
      clearTimer();
      stopStream();
      previewAudioRef.current?.pause();
      revokePreviewUrl(previewUrlRef.current);
      releaseRecordingDuck();
      try {
        if (mediaRecorderRef.current?.state !== "inactive") {
          mediaRecorderRef.current?.stop();
        }
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startRecording() {
    setError(null);
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError("Voice messages are not supported in this browser.");
      releaseRecordingDuck();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      holdRecordingDuck();

      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        stopStream();
        clearTimer();
        releaseRecordingDuck();
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        recordedBlobRef.current = blob;
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        const recordedMs = elapsedRef.current;
        setPreviewUrl(url);
        setPreviewDurationMs(recordedMs);
        setPhase("preview");

        const audio = new Audio(url);
        previewAudioRef.current = audio;
        audio.onloadedmetadata = () => {
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            setPreviewDurationMs(audio.duration * 1000);
          }
        };
        audio.onended = () => setPreviewPlaying(false);
      };

      mediaRecorderRef.current = recorder;
      startedAtRef.current = Date.now();
      elapsedRef.current = 0;
      setElapsedMs(0);
      setPhase("recording");
      recorder.start(100);
      timerRef.current = window.setInterval(() => {
        const next = Date.now() - startedAtRef.current;
        elapsedRef.current = next;
        setElapsedMs(next);
      }, 200);
    } catch {
      stopStream();
      releaseRecordingDuck();
      setError("Microphone permission denied or unavailable.");
      setPhase("idle");
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    recorder.stop();
  }

  function cancelAll() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => {
        stopStream();
        clearTimer();
        releaseRecordingDuck();
        chunksRef.current = [];
        setPhase("idle");
        setElapsedMs(0);
        elapsedRef.current = 0;
      };
      recorder.stop();
      return;
    }
    resetToIdle(true);
  }

  function togglePreviewPlay() {
    const audio = previewAudioRef.current;
    if (!audio) {
      return;
    }
    if (previewPlaying) {
      audio.pause();
      setPreviewPlaying(false);
      return;
    }
    void audio
      .play()
      .then(() => setPreviewPlaying(true))
      .catch(() => {
        setError("Could not preview recording.");
      });
  }

  function handleSend() {
    const url = previewUrlRef.current;
    const recorded = recordedBlobRef.current;
    if (!url || !recorded) {
      return;
    }
    const duration = previewDurationMs || elapsedRef.current;
    previewUrlRef.current = null;
    recordedBlobRef.current = null;
    setPreviewUrl(null);
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
    setPhase("idle");
    setElapsedMs(0);
    elapsedRef.current = 0;
    setPreviewPlaying(false);
    onSend(recorded, duration);
    revokePreviewUrl(url);
  }

  if (phase === "recording") {
    return (
      <div className="flex w-full flex-col gap-2">
        <div className="flex items-center gap-2 rounded-full border border-danger/40 bg-danger/10 px-3 py-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
          <span className="flex-1 text-sm tabular-nums text-foreground">
            {formatDuration(elapsedMs)}
          </span>
          <button
            type="button"
            onClick={cancelAll}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1.5 text-xs text-muted transition hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Cancel
          </button>
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"
          >
            <Square className="h-3.5 w-3.5" />
            Stop
          </button>
        </div>
      </div>
    );
  }

  if (phase === "preview" && previewUrl) {
    return (
      <div className="flex w-full flex-col gap-2">
        <div className="flex items-center gap-2 rounded-full border border-border bg-black/20 px-3 py-2">
          <button
            type="button"
            onClick={togglePreviewPlay}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground transition hover:border-accent/50 hover:text-accent"
            aria-label={previewPlaying ? "Pause preview" : "Play preview"}
          >
            {previewPlaying ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5 translate-x-px" />
            )}
          </button>
          <span className="flex-1 text-sm text-muted">
            Preview · {formatDuration(previewDurationMs)}
          </span>
          <button
            type="button"
            onClick={cancelAll}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1.5 text-xs text-muted transition hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"
          >
            <Send className="h-3.5 w-3.5" />
            Send
          </button>
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => void startRecording()}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-black/20 text-foreground transition hover:border-accent/50 hover:text-accent disabled:opacity-40"
        aria-label="Record voice message"
        title="Record voice message"
      >
        <Mic className="h-4 w-4" />
      </button>
      {error ? (
        <p className="max-w-[10rem] text-right text-[11px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
