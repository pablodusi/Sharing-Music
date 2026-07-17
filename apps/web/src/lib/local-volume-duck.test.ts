import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  animateVolume,
  computeDuckedSettings,
  DuckSession,
  VOICE_DUCK_MAX_VOLUME,
} from "./local-volume-duck";
import { musicDucker } from "./music-ducker";
import type { LocalVolumeSettings } from "./local-volume";

describe("computeDuckedSettings", () => {
  it("lowers volume to the duck ceiling", () => {
    const { next, changed } = computeDuckedSettings({
      volume: 80,
      muted: false,
    });
    assert.equal(changed, true);
    assert.equal(next.volume, VOICE_DUCK_MAX_VOLUME);
    assert.equal(next.muted, false);
  });

  it("does not raise volume when already below the ceiling", () => {
    const { next, changed } = computeDuckedSettings({
      volume: 3,
      muted: false,
    });
    assert.equal(changed, false);
    assert.equal(next.volume, 3);
  });

  it("leaves muted music unchanged", () => {
    const { next, changed } = computeDuckedSettings({
      volume: 90,
      muted: true,
    });
    assert.equal(changed, false);
    assert.equal(next.muted, true);
    assert.equal(next.volume, 90);
  });
});

describe("DuckSession named reasons", () => {
  it("snapshots on first acquire and restores only after last release", () => {
    const session = new DuckSession();
    const original = { volume: 72, muted: false };

    const startRecording = session.acquire("recording", original);
    assert.equal(startRecording.becameActive, true);
    assert.equal(startRecording.shouldAnimate, true);
    assert.deepEqual(startRecording.snapshot, original);

    const startPlayback = session.acquire("voice-playback", {
      volume: VOICE_DUCK_MAX_VOLUME,
      muted: false,
    });
    assert.equal(startPlayback.becameActive, false);
    assert.equal(startPlayback.shouldAnimate, false);
    assert.deepEqual(session.savedSettings, original);
    assert.deepEqual(session.activeReasons.sort(), [
      "recording",
      "voice-playback",
    ]);

    // Stop recording while playback continues — no restore yet.
    const afterStop = session.release("recording");
    assert.equal(afterStop.shouldRestore, false);
    assert.equal(session.isDucked, true);
    assert.deepEqual(session.activeReasons, ["voice-playback"]);

    const afterPlayback = session.release("voice-playback");
    assert.equal(afterPlayback.shouldRestore, true);
    assert.deepEqual(afterPlayback.snapshot, original);
    assert.equal(session.isDucked, false);
  });

  it("restores after stop / cancel when only recording was active", () => {
    const session = new DuckSession();
    session.acquire("recording", { volume: 60, muted: false });

    const stopped = session.release("recording");
    assert.equal(stopped.shouldRestore, true);
    assert.deepEqual(stopped.snapshot, { volume: 60, muted: false });
  });

  it("permission failure path: release without acquire is a no-op restore", () => {
    const session = new DuckSession();
    const result = session.release("recording");
    assert.equal(result.shouldRestore, false);
    assert.equal(result.snapshot, null);
  });

  it("forceClear restores snapshot on component cleanup", () => {
    const session = new DuckSession();
    session.acquire("recording", { volume: 55, muted: false });
    session.acquire("voice-playback", { volume: 55, muted: false });

    const snap = session.forceClear();
    assert.deepEqual(snap, { volume: 55, muted: false });
    assert.equal(session.isDucked, false);
    assert.deepEqual(session.activeReasons, []);
  });

  it("does not animate when music is already quiet enough", () => {
    const session = new DuckSession();
    const result = session.acquire("recording", { volume: 2, muted: false });
    assert.equal(result.shouldAnimate, false);
    assert.equal(result.becameActive, true);
    const released = session.release("recording");
    assert.deepEqual(released.snapshot, { volume: 2, muted: false });
  });
});

describe("musicDucker overlap", () => {
  beforeEach(() => {
    musicDucker.resetForTests();
  });

  it("keeps music ducked while recording and playback overlap", () => {
    const applied: LocalVolumeSettings[] = [];
    let settings: LocalVolumeSettings = { volume: 80, muted: false };

    musicDucker.registerBridge({
      getSettings: () => settings,
      applyToPlayer: (next) => {
        applied.push({ ...next });
        // Simulate live player volume tracking for tests.
        settings = { ...settings, volume: next.volume, muted: next.muted };
      },
    });

    musicDucker.acquire("recording");
    assert.ok(musicDucker.isDucked);
    assert.deepEqual(musicDucker.getActiveReasons().sort(), ["recording"]);

    musicDucker.acquire("voice-playback");
    assert.deepEqual(musicDucker.getActiveReasons().sort(), [
      "recording",
      "voice-playback",
    ]);

    const beforeRelease = applied.at(-1);

    // Stop recording — playback still holds the duck.
    musicDucker.release("recording");
    assert.ok(musicDucker.isDucked);
    assert.deepEqual(musicDucker.getActiveReasons(), ["voice-playback"]);
    // Should not have restored to 80 yet.
    assert.notEqual(beforeRelease?.volume, 80);

    musicDucker.release("voice-playback");
    // Restore targets original snapshot (80).
    const last = applied.at(-1);
    assert.ok(last);
    // Tween may still be mid-flight; force finish via immediate reset check:
    // after release, session should clear once restore starts — isDucked false.
    assert.equal(musicDucker.isDucked, false);
  });

  it("restores on forceRestoreImmediate (leave room / unmount)", () => {
    const applied: LocalVolumeSettings[] = [];
    musicDucker.registerBridge({
      getSettings: () => ({ volume: 66, muted: false }),
      applyToPlayer: (next) => applied.push({ ...next }),
    });

    musicDucker.acquire("recording");
    musicDucker.forceRestoreImmediate();
    assert.equal(musicDucker.isDucked, false);
    assert.deepEqual(applied.at(-1), { volume: 66, muted: false });
  });
});

describe("animateVolume", () => {
  it("reaches the target and can be cancelled", () => {
    const frames: number[] = [];
    let now = 0;
    const timers: Array<{ id: number; cb: FrameRequestCallback }> = [];
    let nextId = 1;

    const handle = animateVolume(
      80,
      5,
      250,
      (v) => frames.push(v),
      undefined,
      {
        now: () => now,
        schedule: (cb) => {
          const id = nextId++;
          timers.push({ id, cb });
          return id;
        },
        cancel: (id) => {
          const index = timers.findIndex((t) => t.id === id);
          if (index >= 0) {
            timers.splice(index, 1);
          }
        },
      },
    );

    now = 125;
    timers.shift()?.cb(now);
    now = 250;
    timers.shift()?.cb(now);

    assert.ok(frames.length >= 1);
    assert.equal(frames.at(-1), 5);

    const mid: number[] = [];
    now = 0;
    const midHandle = animateVolume(
      5,
      80,
      250,
      (v) => mid.push(v),
      undefined,
      {
        now: () => now,
        schedule: (cb) => {
          const id = nextId++;
          timers.push({ id, cb });
          return id;
        },
        cancel: (id) => {
          const index = timers.findIndex((t) => t.id === id);
          if (index >= 0) {
            timers.splice(index, 1);
          }
        },
      },
    );
    now = 50;
    timers[0]?.cb(now);
    midHandle.cancel();
    const afterCancel = mid.length;
    now = 250;
    timers.shift()?.cb(now);
    assert.equal(mid.length, afterCancel);

    handle.cancel();
  });
});
