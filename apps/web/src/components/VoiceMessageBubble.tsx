"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { formatDuration } from "@/lib/format";
import { musicDucker } from "@/lib/music-ducker";
import { voicePlaybackCoordinator } from "@/lib/voice-playback";

type VoiceMessageBubbleProps = {
  messageId: string;
  audioUrl: string;
  durationMs?: number;
};

/**
 * Manual-only voice playback. Never autoplays.
 * Ducks local YouTube volume while playing; only one voice at a time.
 */
export function VoiceMessageBubble({
  messageId,
  audioUrl,
  durationMs = 0,
}: VoiceMessageBubbleProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const holdingDuckRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [resolvedDurationMs, setResolvedDurationMs] = useState(durationMs);
  const [error, setError] = useState<string | null>(null);

  function releaseDuckIfHeld() {
    if (holdingDuckRef.current) {
      holdingDuckRef.current = false;
      musicDucker.release("voice-playback");
    }
  }

  const forceStopRef = useRef(() => {
    // replaced each render
  });
  forceStopRef.current = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
    }
    holdingDuckRef.current = false;
    setIsPlaying(false);
    voicePlaybackCoordinator.release(messageId);
  };

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audio.preload = "metadata";
    audioRef.current = audio;

    const onTime = () => setPositionMs(audio.currentTime * 1000);
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setResolvedDurationMs(audio.duration * 1000);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setPositionMs(0);
      voicePlaybackCoordinator.release(messageId);
      releaseDuckIfHeld();
    };
    const onError = () => {
      setError("Could not play voice message.");
      setIsPlaying(false);
      voicePlaybackCoordinator.release(messageId);
      releaseDuckIfHeld();
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    const unregister = voicePlaybackCoordinator.register(messageId, () => {
      forceStopRef.current();
    });

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      unregister();
      releaseDuckIfHeld();
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, messageId]);

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      voicePlaybackCoordinator.release(messageId);
      releaseDuckIfHeld();
      return;
    }

    setError(null);
    voicePlaybackCoordinator.claim(messageId);
    musicDucker.acquire("voice-playback");
    holdingDuckRef.current = true;

    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      setError("Playback blocked. Tap Play again.");
      setIsPlaying(false);
      voicePlaybackCoordinator.release(messageId);
      releaseDuckIfHeld();
    }
  }

  const duration = resolvedDurationMs || durationMs || 1;
  const progress = Math.min(100, (positionMs / duration) * 100);

  return (
    <div className="mt-1 max-w-xs rounded-2xl rounded-tl-md border border-border bg-black/25 px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => void togglePlay()}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition hover:bg-accent-hover"
          aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 translate-x-px" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted">
            <span>{formatDuration(positionMs)}</span>
            <span>{formatDuration(resolvedDurationMs || durationMs)}</span>
          </div>
        </div>
      </div>
      {error ? <p className="mt-1.5 text-[11px] text-danger">{error}</p> : null}
    </div>
  );
}
