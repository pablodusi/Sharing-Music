import { isPlaybackInactive } from './playback-recovery';

describe('isPlaybackInactive', () => {
  const base = {
    youtubeVideoId: 'abc1234',
    isPlaying: true,
    positionMs: 0,
    durationMs: 180_000,
    updatedAt: new Date('2026-07-17T15:00:00.000Z'),
  };

  it('treats missing video as inactive', () => {
    expect(
      isPlaybackInactive({ ...base, youtubeVideoId: null }),
    ).toBe(true);
    expect(isPlaybackInactive(null)).toBe(true);
  });

  it('treats paused / not playing as inactive', () => {
    expect(isPlaybackInactive({ ...base, isPlaying: false })).toBe(true);
  });

  it('treats past-duration playing track as inactive (stale after restart)', () => {
    const started = Date.parse('2026-07-17T15:00:00.000Z');
    expect(
      isPlaybackInactive(
        { ...base, updatedAt: new Date(started) },
        started + 200_000,
      ),
    ).toBe(true);
  });

  it('keeps mid-track playing state active', () => {
    const started = Date.parse('2026-07-17T15:00:00.000Z');
    expect(
      isPlaybackInactive(
        { ...base, updatedAt: new Date(started) },
        started + 30_000,
      ),
    ).toBe(false);
  });
});
