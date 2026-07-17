/** Drift under this threshold is left alone to avoid seek jitter. */
export const PLAYBACK_SYNC_DRIFT_MS = 1000;

export type PlaybackClockState = {
  positionMs: number;
  isPlaying: boolean;
  updatedAt: string | Date | number;
  durationMs?: number | null;
};

export function clampPlaybackPositionMs(
  positionMs: number,
  durationMs?: number | null,
): number {
  if (!Number.isFinite(positionMs) || positionMs <= 0) {
    return 0;
  }
  if (
    durationMs != null &&
    Number.isFinite(durationMs) &&
    durationMs > 0 &&
    positionMs > durationMs
  ) {
    return durationMs;
  }
  return positionMs;
}

/**
 * Wall-clock position for a room playback snapshot.
 * When playing: positionMs + elapsed since updatedAt.
 * When paused: positionMs as-is.
 */
export function expectedPositionMs(
  state: PlaybackClockState,
  nowMs: number = Date.now(),
): number {
  const base = Number.isFinite(state.positionMs) ? state.positionMs : 0;
  const updatedAtMs = new Date(state.updatedAt).getTime();
  const elapsed =
    state.isPlaying && Number.isFinite(updatedAtMs)
      ? Math.max(0, nowMs - updatedAtMs)
      : 0;

  return clampPlaybackPositionMs(base + elapsed, state.durationMs);
}

export function shouldCorrectPlaybackDrift(
  localPositionMs: number,
  expectedMs: number,
  thresholdMs: number = PLAYBACK_SYNC_DRIFT_MS,
): boolean {
  if (!Number.isFinite(localPositionMs) || !Number.isFinite(expectedMs)) {
    return true;
  }
  return Math.abs(localPositionMs - expectedMs) > thresholdMs;
}
