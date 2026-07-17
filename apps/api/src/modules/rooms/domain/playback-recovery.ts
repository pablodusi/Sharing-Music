/**
 * Wall-clock check: persisted playback is no longer a viable "now playing".
 * Used after restart / stuck black player recovery.
 */
export function isPlaybackInactive(
  playback: {
    youtubeVideoId: string | null;
    isPlaying: boolean;
    positionMs: number;
    durationMs: number | null;
    updatedAt: Date | string;
  } | null
  | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!playback?.youtubeVideoId) {
    return true;
  }
  if (!playback.isPlaying) {
    return true;
  }
  const duration = playback.durationMs ?? 0;
  if (duration > 0) {
    const updatedAtMs = new Date(playback.updatedAt).getTime();
    const elapsed = Number.isFinite(updatedAtMs)
      ? Math.max(0, nowMs - updatedAtMs)
      : 0;
    const expected = Math.max(0, playback.positionMs) + elapsed;
    if (expected >= duration) {
      return true;
    }
  }
  return false;
}
