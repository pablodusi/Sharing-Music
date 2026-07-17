import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampPlaybackPositionMs,
  expectedPositionMs,
  PLAYBACK_SYNC_DRIFT_MS,
  shouldCorrectPlaybackDrift,
} from "./playback-sync";

describe("expectedPositionMs", () => {
  it("joins 30 seconds after playback started", () => {
    const startedAt = Date.parse("2026-07-17T15:00:00.000Z");
    const joinAt = startedAt + 30_000;

    const expected = expectedPositionMs(
      {
        positionMs: 0,
        isPlaying: true,
        updatedAt: new Date(startedAt).toISOString(),
        durationMs: 180_000,
      },
      joinAt,
    );

    assert.equal(expected, 30_000);
  });

  it("reconnects later and advances from the snapshot clock", () => {
    const startedAt = Date.parse("2026-07-17T15:00:00.000Z");
    const reconnectAt = startedAt + 95_000;

    const expected = expectedPositionMs(
      {
        positionMs: 0,
        isPlaying: true,
        updatedAt: new Date(startedAt).toISOString(),
        durationMs: 240_000,
      },
      reconnectAt,
    );

    assert.equal(expected, 95_000);
  });

  it("on autoplay-blocked tap, uses the latest expected position not the original", () => {
    const startedAt = Date.parse("2026-07-17T15:00:00.000Z");
    const firstReadyAt = startedAt + 5_000;
    const tapAt = startedAt + 42_000;

    const firstExpected = expectedPositionMs(
      {
        positionMs: 0,
        isPlaying: true,
        updatedAt: new Date(startedAt).toISOString(),
        durationMs: 180_000,
      },
      firstReadyAt,
    );
    const tapExpected = expectedPositionMs(
      {
        positionMs: 0,
        isPlaying: true,
        updatedAt: new Date(startedAt).toISOString(),
        durationMs: 180_000,
      },
      tapAt,
    );

    assert.equal(firstExpected, 5_000);
    assert.equal(tapExpected, 42_000);
    assert.notEqual(tapExpected, firstExpected);
  });

  it("keeps paused room position frozen", () => {
    const pausedAt = Date.parse("2026-07-17T15:00:00.000Z");
    const later = pausedAt + 60_000;

    const expected = expectedPositionMs(
      {
        positionMs: 45_000,
        isPlaying: false,
        updatedAt: new Date(pausedAt).toISOString(),
        durationMs: 180_000,
      },
      later,
    );

    assert.equal(expected, 45_000);
  });

  it("clamps negative and past-duration positions", () => {
    assert.equal(clampPlaybackPositionMs(-500, 120_000), 0);
    assert.equal(clampPlaybackPositionMs(150_000, 120_000), 120_000);

    const startedAt = Date.parse("2026-07-17T15:00:00.000Z");
    const pastEnd = expectedPositionMs(
      {
        positionMs: 0,
        isPlaying: true,
        updatedAt: new Date(startedAt).toISOString(),
        durationMs: 60_000,
      },
      startedAt + 90_000,
    );
    assert.equal(pastEnd, 60_000);
  });
});

describe("shouldCorrectPlaybackDrift", () => {
  it("does not correct drift under about 1 second", () => {
    assert.equal(shouldCorrectPlaybackDrift(30_000, 30_400), false);
    assert.equal(
      shouldCorrectPlaybackDrift(30_000, 30_000 + PLAYBACK_SYNC_DRIFT_MS),
      false,
    );
    assert.equal(
      shouldCorrectPlaybackDrift(30_000, 30_000 + PLAYBACK_SYNC_DRIFT_MS + 1),
      true,
    );
  });
});
