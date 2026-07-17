export function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatProgress(currentMs: number, totalMs: number) {
  if (totalMs <= 0) {
    return 0;
  }

  return Math.min(100, (currentMs / totalMs) * 100);
}
