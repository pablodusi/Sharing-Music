import type { LocalVolumeSettings } from "./local-volume";

/** Local music volume ceiling while voice recording/playback is active. */
export const VOICE_DUCK_MAX_VOLUME = 5;

/** Smooth duck / restore duration. */
export const VOICE_DUCK_DURATION_MS = 250;

/** Named ducking reasons — restore only when none remain. */
export type DuckReason = "recording" | "voice-playback";

export type VolumeTweenHandle = {
  cancel: () => void;
};

/**
 * Target settings while ducking.
 * Never raises volume; if already muted or ≤ 5%, returns a no-op copy.
 */
export function computeDuckedSettings(
  current: LocalVolumeSettings,
  maxVolume = VOICE_DUCK_MAX_VOLUME,
): { next: LocalVolumeSettings; changed: boolean } {
  if (current.muted || current.volume <= maxVolume) {
    return { next: { ...current }, changed: false };
  }

  return {
    next: { volume: maxVolume, muted: false },
    changed: true,
  };
}

/**
 * Animate a numeric volume from→to over durationMs.
 * Calls onUpdate each frame; onComplete when finished (unless cancelled).
 */
export function animateVolume(
  from: number,
  to: number,
  durationMs: number,
  onUpdate: (volume: number) => void,
  onComplete?: () => void,
  clock?: {
    now?: () => number;
    schedule?: (cb: FrameRequestCallback) => number;
    cancel?: (id: number) => void;
  },
): VolumeTweenHandle {
  const nowFn =
    clock?.now ??
    (() =>
      typeof performance !== "undefined" ? performance.now() : Date.now());
  const schedule =
    clock?.schedule ??
    ((cb: FrameRequestCallback) =>
      typeof requestAnimationFrame !== "undefined"
        ? requestAnimationFrame(cb)
        : (setTimeout(() => cb(nowFn()), 16) as unknown as number));
  const cancelSchedule =
    clock?.cancel ??
    ((id: number) =>
      typeof cancelAnimationFrame !== "undefined"
        ? cancelAnimationFrame(id)
        : clearTimeout(id));

  if (durationMs <= 0 || from === to) {
    onUpdate(to);
    onComplete?.();
    return { cancel: () => undefined };
  }

  let frameId = 0;
  let cancelled = false;
  const start = nowFn();

  const tick = (time: number) => {
    if (cancelled) {
      return;
    }

    const elapsed = time - start;
    const t = Math.min(1, elapsed / durationMs);
    const eased = 1 - (1 - t) ** 3;
    const value = from + (to - from) * eased;
    onUpdate(value);

    if (t < 1) {
      frameId = schedule(tick);
    } else {
      onUpdate(to);
      onComplete?.();
    }
  };

  frameId = schedule(tick);

  return {
    cancel: () => {
      cancelled = true;
      cancelSchedule(frameId);
    },
  };
}

export type AcquireDuckResult = {
  /** True when this acquire was the first active reason (should start ducking). */
  becameActive: boolean;
  snapshot: LocalVolumeSettings;
  target: LocalVolumeSettings;
  shouldAnimate: boolean;
};

export type ReleaseDuckResult = {
  /** True when no reasons remain — caller should restore volume. */
  shouldRestore: boolean;
  snapshot: LocalVolumeSettings | null;
};

/**
 * Pure ducking session with named reasons.
 * Snapshot is taken on the first acquire; restore only after the last release.
 */
export class DuckSession {
  private snapshot: LocalVolumeSettings | null = null;
  private reasons = new Set<DuckReason>();

  get isDucked(): boolean {
    return this.snapshot !== null;
  }

  get activeReasons(): DuckReason[] {
    return [...this.reasons];
  }

  get savedSettings(): LocalVolumeSettings | null {
    return this.snapshot ? { ...this.snapshot } : null;
  }

  hasReason(reason: DuckReason): boolean {
    return this.reasons.has(reason);
  }

  /**
   * Acquire a named duck reason.
   * `current` is only used for the snapshot when this is the first reason.
   * `live` is the current player volume (for animation start).
   */
  acquire(
    reason: DuckReason,
    current: LocalVolumeSettings,
    live: LocalVolumeSettings = current,
  ): AcquireDuckResult {
    const becameActive = this.reasons.size === 0;
    this.reasons.add(reason);

    if (!this.snapshot) {
      this.snapshot = { ...current };
    }

    const { next, changed } = computeDuckedSettings(this.snapshot);

    return {
      becameActive,
      snapshot: { ...this.snapshot },
      target: changed ? next : { ...live },
      shouldAnimate:
        becameActive && changed && live.volume !== next.volume,
    };
  }

  /**
   * Release a named reason. Restore only when the set becomes empty.
   */
  release(reason: DuckReason): ReleaseDuckResult {
    this.reasons.delete(reason);

    if (this.reasons.size > 0) {
      return { shouldRestore: false, snapshot: null };
    }

    const snap = this.snapshot;
    this.snapshot = null;
    return {
      shouldRestore: snap !== null,
      snapshot: snap ? { ...snap } : null,
    };
  }

  /** Clear all reasons and return the snapshot (if any). */
  forceClear(): LocalVolumeSettings | null {
    this.reasons.clear();
    const snap = this.snapshot;
    this.snapshot = null;
    return snap ? { ...snap } : null;
  }

  /** @deprecated Prefer acquire/release with reasons. */
  beginDuck(current: LocalVolumeSettings): {
    snapshot: LocalVolumeSettings;
    target: LocalVolumeSettings;
    shouldAnimate: boolean;
  } {
    const result = this.acquire("voice-playback", current, current);
    return {
      snapshot: result.snapshot,
      target: result.target,
      shouldAnimate: result.shouldAnimate,
    };
  }

  /** @deprecated Prefer acquire/release with reasons. */
  endDuck(): LocalVolumeSettings | null {
    return this.forceClear();
  }
}
