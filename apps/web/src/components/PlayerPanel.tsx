"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Disc3, Search, Volume2, VolumeX } from "lucide-react";
import { formatDuration, formatProgress } from "@/lib/format";
import {
  applyLocalVolumeToPlayer,
  loadLocalVolume,
  saveLocalVolume,
  type LocalVolumeSettings,
} from "@/lib/local-volume";
import { musicDucker } from "@/lib/music-ducker";
import {
  expectedPositionMs,
  shouldCorrectPlaybackDrift,
} from "@/lib/playback-sync";
import { loadYouTubeIframeAPI, youtubeThumbnailUrl } from "@/lib/youtube";
import type { NowPlaying } from "@/lib/types";

type PlayerPanelProps = {
  nowPlaying: NowPlaying | null;
  onEnded: () => void;
};

function EmptyPlayerState() {
  return (
    <div className="space-y-6">
      <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-dashed border-border bg-black/25">
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Search className="h-5 w-5" />
          </span>
          <p className="text-sm font-medium text-foreground">
            No song is playing yet
          </p>
          <p className="max-w-sm text-xs text-muted">
            Search above to start the room. The first pick becomes Now playing.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Listener-only player: no pause / resume / seek / skip controls for the user.
 * Local mute + volume only affect this browser (saved in localStorage).
 * Position corrections are local-only — they never mutate shared room state.
 */
export function PlayerPanel({ nowPlaying, onEnded }: PlayerPanelProps) {
  const [playerGeneration, setPlayerGeneration] = useState(0);

  if (!nowPlaying) {
    return <EmptyPlayerState />;
  }

  return (
    <ActiveYouTubePlayer
      key={`${nowPlaying.track.youtubeVideoId}-${playerGeneration}`}
      nowPlaying={nowPlaying}
      onEnded={onEnded}
      onRetry={() => setPlayerGeneration((value) => value + 1)}
    />
  );
}

function readLocalPositionMs(player: YT.Player): number {
  try {
    if (typeof player.getCurrentTime !== "function") {
      return 0;
    }
    return Math.max(0, player.getCurrentTime() * 1000);
  } catch {
    return 0;
  }
}

function readDurationMs(player: YT.Player, fallbackMs: number): number {
  try {
    if (typeof player.getDuration === "function") {
      const duration = player.getDuration();
      if (duration > 0) {
        return duration * 1000;
      }
    }
  } catch {
    // Player may not be ready.
  }
  return fallbackMs > 0 ? fallbackMs : 0;
}

function ActiveYouTubePlayer({
  nowPlaying,
  onEnded,
  onRetry,
}: {
  nowPlaying: NowPlaying;
  onEnded: () => void;
  onRetry: () => void;
}) {
  const { track, addedBy } = nowPlaying;
  const reactId = useId().replace(/:/g, "");
  const containerId = `yt-player-${reactId}`;
  const playerRef = useRef<YT.Player | null>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  /** Prevent double advance when ENDED and onError both fire for the same id. */
  const advancedVideoIdRef = useRef<string | null>(null);

  const playbackRef = useRef({
    positionMs: nowPlaying.positionMs,
    isPlaying: nowPlaying.isPlaying,
    updatedAt: nowPlaying.updatedAt,
    durationMs: track.durationMs,
    youtubeVideoId: track.youtubeVideoId,
  });
  playbackRef.current = {
    positionMs: nowPlaying.positionMs,
    isPlaying: nowPlaying.isPlaying,
    updatedAt: nowPlaying.updatedAt,
    durationMs: track.durationMs,
    youtubeVideoId: track.youtubeVideoId,
  };
  /** Video id currently loaded in the YT iframe (may lag React props). */
  const loadedVideoIdRef = useRef<string | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [positionMs, setPositionMs] = useState(nowPlaying.positionMs);
  const [durationMs, setDurationMs] = useState(track.durationMs);
  const [error, setError] = useState<string | null>(null);
  const [volumeSettings, setVolumeSettings] = useState<LocalVolumeSettings>({
    volume: 80,
    muted: false,
  });

  const needsGestureRef = useRef(false);
  const hasStartedRef = useRef(false);
  const volumeSettingsRef = useRef(volumeSettings);
  volumeSettingsRef.current = volumeSettings;

  useEffect(() => {
    setVolumeSettings(loadLocalVolume());
  }, []);

  useEffect(() => {
    const bridge = {
      getSettings: () => volumeSettingsRef.current,
      applyToPlayer: (settings: LocalVolumeSettings) => {
        const player = playerRef.current;
        if (!player) {
          return;
        }
        try {
          applyLocalVolumeToPlayer(player, settings);
        } catch {
          // Player may not be ready.
        }
      },
    };

    musicDucker.registerBridge(bridge);
    return () => {
      musicDucker.unregisterBridge(bridge);
    };
  }, []);

  function advanceCurrentTrackOnce(reason: "ended" | "error") {
    const videoId = playbackRef.current.youtubeVideoId;
    if (!videoId || advancedVideoIdRef.current === videoId) {
      return;
    }
    advancedVideoIdRef.current = videoId;
    if (reason === "error") {
      setError(
        "YouTube could not play this video (embed blocked or unavailable). Advancing…",
      );
    }
    setIsPlaying(false);
    onEndedRef.current();
  }

  function tryPlay(player: YT.Player) {
    try {
      player.playVideo();
    } catch {
      needsGestureRef.current = true;
      setNeedsGesture(true);
    }
  }

  function syncVolumeToPlayer(player: YT.Player, settings: LocalVolumeSettings) {
    try {
      applyLocalVolumeToPlayer(player, settings);
    } catch {
      // Player may not be ready for volume APIs yet.
    }
  }

  /** Local-only seek/play alignment with room clock. Does not write shared state. */
  function syncPlaybackToRoom(
    player: YT.Player,
    options: { forceSeek?: boolean } = {},
  ) {
    const state = playbackRef.current;
    const duration = readDurationMs(player, state.durationMs);
    if (duration > 0) {
      setDurationMs(duration);
    }

    const expected = expectedPositionMs({
      positionMs: state.positionMs,
      isPlaying: state.isPlaying,
      updatedAt: state.updatedAt,
      durationMs: duration || state.durationMs,
    });
    const local = readLocalPositionMs(player);
    const shouldSeek =
      options.forceSeek || shouldCorrectPlaybackDrift(local, expected);

    if (shouldSeek && typeof player.seekTo === "function") {
      try {
        player.seekTo(expected / 1000, true);
        setPositionMs(expected);
      } catch {
        // Seek may fail before media is ready; retry on next sync.
      }
    }

    if (state.isPlaying) {
      tryPlay(player);
    } else {
      try {
        player.pauseVideo();
      } catch {
        // ignore
      }
      setIsPlaying(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    let progressTimer: number | undefined;

    async function setup() {
      try {
        await loadYouTubeIframeAPI();
        if (cancelled) {
          return;
        }

        const initialStartSeconds =
          expectedPositionMs({
            positionMs: playbackRef.current.positionMs,
            isPlaying: playbackRef.current.isPlaying,
            updatedAt: playbackRef.current.updatedAt,
            durationMs: playbackRef.current.durationMs,
          }) / 1000;

        loadedVideoIdRef.current = track.youtubeVideoId;
        playerRef.current = new window.YT!.Player(containerId, {
          height: "100%",
          width: "100%",
          videoId: track.youtubeVideoId,
          playerVars: {
            autoplay: playbackRef.current.isPlaying ? 1 : 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            iv_load_policy: 3,
            start: Math.floor(initialStartSeconds),
            origin:
              typeof window !== "undefined" ? window.location.origin : undefined,
          },
          events: {
            onReady: (event) => {
              if (cancelled) {
                return;
              }
              loadedVideoIdRef.current = playbackRef.current.youtubeVideoId;
              setIsReady(true);
              musicDucker.registerPlayer(event.target);
              syncVolumeToPlayer(event.target, volumeSettingsRef.current);
              const duration = readDurationMs(
                event.target,
                playbackRef.current.durationMs,
              );
              if (duration > 0) {
                setDurationMs(duration);
              }
              // Player recreate / first ready — align to room clock.
              syncPlaybackToRoom(event.target, { forceSeek: true });
            },
            onStateChange: (event) => {
              const state = event.data;
              const YTState = window.YT!.PlayerState;

              if (state === YTState.PLAYING) {
                hasStartedRef.current = true;
                needsGestureRef.current = false;
                setIsPlaying(true);
                setNeedsGesture(false);
                setError(null);
                syncVolumeToPlayer(event.target, volumeSettingsRef.current);
                const duration = readDurationMs(
                  event.target,
                  playbackRef.current.durationMs,
                );
                if (duration > 0) {
                  setDurationMs(duration);
                }
              } else if (state === YTState.PAUSED) {
                setIsPlaying(false);
                if (!playbackRef.current.isPlaying) {
                  return;
                }
                if (!hasStartedRef.current) {
                  needsGestureRef.current = true;
                  setNeedsGesture(true);
                } else if (!needsGestureRef.current) {
                  tryPlay(event.target);
                }
              } else if (state === YTState.ENDED) {
                advanceCurrentTrackOnce("ended");
              } else if (state === YTState.CUED) {
                if (
                  playbackRef.current.isPlaying &&
                  !needsGestureRef.current
                ) {
                  tryPlay(event.target);
                }
              }
            },
            onError: () => {
              // Unembeddable / deleted / blocked — advance once (server is idempotent).
              advanceCurrentTrackOnce("error");
            },
          },
        });

        progressTimer = window.setInterval(() => {
          const player = playerRef.current;
          if (!player || typeof player.getCurrentTime !== "function") {
            return;
          }
          try {
            setPositionMs(player.getCurrentTime() * 1000);
            const duration = player.getDuration();
            if (duration > 0) {
              setDurationMs(duration * 1000);
            }
          } catch {
            // Player may be destroyed mid-tick.
          }
        }, 500);

        // Avoid a permanent black frame if the iframe never becomes ready.
        window.setTimeout(() => {
          if (cancelled) {
            return;
          }
          if (!playerRef.current) {
            setError("Could not initialize the YouTube player.");
          }
        }, 12_000);
      } catch {
        if (!cancelled) {
          setError("Could not load the YouTube player.");
        }
      }
    }

    void setup();

    return () => {
      cancelled = true;
      if (progressTimer) {
        window.clearInterval(progressTimer);
      }
      try {
        playerRef.current?.destroy();
      } catch {
        // ignore
      }
      musicDucker.registerPlayer(null);
      musicDucker.forceRestoreImmediate();
      playerRef.current = null;
      loadedVideoIdRef.current = null;
      setIsReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId]);

  // Track change or room snapshot clock update (join / reconnect / advance).
  useEffect(() => {
    const player = playerRef.current;
    if (!isReady || !player) {
      return;
    }

    const loadedId = loadedVideoIdRef.current;
    const wantsId = track.youtubeVideoId;
    setError(null);

    const expected = expectedPositionMs({
      positionMs: nowPlaying.positionMs,
      isPlaying: nowPlaying.isPlaying,
      updatedAt: nowPlaying.updatedAt,
      durationMs: track.durationMs,
    });
    setPositionMs(expected);
    setDurationMs(track.durationMs);

    if (loadedId !== wantsId && typeof player.loadVideoById === "function") {
      needsGestureRef.current = false;
      hasStartedRef.current = false;
      advancedVideoIdRef.current = null;
      setNeedsGesture(false);
      player.loadVideoById({
        videoId: wantsId,
        startSeconds: expected / 1000,
      });
      loadedVideoIdRef.current = wantsId;
      syncVolumeToPlayer(player, volumeSettingsRef.current);
      if (nowPlaying.isPlaying) {
        tryPlay(player);
      } else {
        try {
          player.pauseVideo();
        } catch {
          // ignore
        }
      }
      return;
    }

    syncPlaybackToRoom(player);
  }, [
    track.id,
    track.youtubeVideoId,
    track.durationMs,
    nowPlaying.positionMs,
    nowPlaying.isPlaying,
    nowPlaying.updatedAt,
    isReady,
  ]);

  // Tab wake-up / foreground — re-align if the player drifted while hidden.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState !== "visible") {
        return;
      }
      const player = playerRef.current;
      if (!player || !isReady) {
        return;
      }
      syncPlaybackToRoom(player);
    }

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isReady]);

  function updateVolumeSettings(next: LocalVolumeSettings) {
    setVolumeSettings(next);
    saveLocalVolume(next);
    // If voice ducking is active, keep the ducked playback level —
    // user preference is saved for restore.
    if (musicDucker.isDucked) {
      return;
    }
    const player = playerRef.current;
    if (player && isReady) {
      syncVolumeToPlayer(player, next);
    }
  }

  function toggleMute() {
    updateVolumeSettings({
      ...volumeSettings,
      muted: !volumeSettings.muted,
    });
  }

  function handleVolumeChange(event: React.ChangeEvent<HTMLInputElement>) {
    const volume = Number(event.target.value);
    updateVolumeSettings({
      volume,
      muted: volume === 0 ? true : false,
    });
  }

  function unlockAudio() {
    const player = playerRef.current;
    if (!player) {
      return;
    }
    needsGestureRef.current = false;
    setNeedsGesture(false);
    syncVolumeToPlayer(player, volumeSettingsRef.current);
    // Recalculate latest expected position at tap time (not the first-ready value).
    syncPlaybackToRoom(player, { forceSeek: true });
  }

  const progress = formatProgress(positionMs, durationMs || 1);
  const isEffectivelyMuted = volumeSettings.muted || volumeSettings.volume === 0;
  const artUrl = youtubeThumbnailUrl(track.youtubeVideoId);
  const albumLabel =
    track.album && track.album !== track.title ? track.album : null;

  return (
    <div className="space-y-6">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-glow ring-1 ring-white/10">
        <div id={containerId} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 z-10 bg-transparent" aria-hidden />
        {needsGesture ? (
          <button
            type="button"
            onClick={unlockAudio}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 px-6 text-sm font-medium text-foreground"
          >
            Tap once to sync with the room (required by the browser)
          </button>
        ) : null}
      </div>

      {/* Rich now playing metadata */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-7">
        <div className="relative mx-auto shrink-0 sm:mx-0">
          <div
            className={`relative h-44 w-44 overflow-hidden rounded-2xl bg-black/40 shadow-glow ring-1 ring-white/10 sm:h-52 sm:w-52 ${
              isPlaying ? "art-pulse" : ""
            }`}
            style={
              track.coverColor
                ? { boxShadow: `0 0 48px ${track.coverColor}33` }
                : undefined
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={artUrl}
              alt=""
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
            {isPlaying ? (
              <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-accent backdrop-blur-sm">
                <Disc3 className="h-3 w-3 animate-spin [animation-duration:3s]" />
                Live
              </span>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 flex-1 text-center sm:pb-1 sm:text-left">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-accent">
            Now playing · room sync
          </p>
          <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
            {track.title}
          </h2>
          <p className="mt-1.5 text-base text-muted">{track.artist}</p>
          {albumLabel ? (
            <p className="mt-0.5 truncate text-sm text-muted/80">{albumLabel}</p>
          ) : null}
          <p className="mt-3 inline-flex items-center justify-center gap-1.5 text-xs text-muted sm:justify-start">
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white"
              style={{ backgroundColor: addedBy.avatarColor }}
            >
              {addedBy.initial}
            </span>
            Started by {addedBy.name}
          </p>

          <p className="mt-2 text-xs text-muted">
            {isPlaying
              ? "Shared playback is locked — only your local volume can change."
              : isReady
                ? "Waiting for room playback…"
                : "Loading player…"}
          </p>

          {error ? (
            <div className="mt-2 space-y-2">
              <p className="text-sm text-danger">{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="rounded-full border border-border bg-black/30 px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-accent/40 hover:text-accent"
              >
                Retry player
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">
        <div aria-hidden>
          <div className="pointer-events-none h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-accent-hot transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs tabular-nums text-muted">
            <span>{formatDuration(positionMs)}</span>
            <span>
              {durationMs > 0 ? formatDuration(durationMs) : "Live / —"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-black/20 px-3 py-2.5 sm:max-w-md">
          <button
            type="button"
            onClick={toggleMute}
            disabled={!isReady}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-black/30 text-foreground transition hover:border-accent/40 hover:text-accent disabled:opacity-50"
            aria-label={isEffectivelyMuted ? "Unmute" : "Mute"}
            title="Local mute — only affects you"
          >
            {isEffectivelyMuted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>

          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={volumeSettings.volume}
            onChange={handleVolumeChange}
            disabled={!isReady}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-[var(--accent)] disabled:opacity-50"
            aria-label="Local volume"
            title="Local volume — only affects you"
          />

          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">
            {isEffectivelyMuted ? "Mute" : `${volumeSettings.volume}%`}
          </span>
        </div>
      </div>
    </div>
  );
}
