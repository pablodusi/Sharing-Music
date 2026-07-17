import {
  applyLocalVolumeToPlayer,
  type LocalVolumeSettings,
} from "./local-volume";
import {
  animateVolume,
  DuckSession,
  VOICE_DUCK_DURATION_MS,
  type DuckReason,
  type VolumeTweenHandle,
} from "./local-volume-duck";

export type MusicVolumeBridge = {
  /** Current user-facing local volume (slider / localStorage). */
  getSettings: () => LocalVolumeSettings;
  /** Apply to YouTube only — never persist ducked levels. */
  applyToPlayer: (settings: LocalVolumeSettings) => void;
};

export type { DuckReason };

/**
 * Singleton: ducks / restores local YouTube volume for voice recording
 * and voice-message playback. Does not touch shared room sync.
 *
 * Use named reasons so overlapping ducks (recording + playback) only
 * restore when every reason has been released.
 */
class MusicDucker {
  private bridge: MusicVolumeBridge | null = null;
  private player: YT.Player | null = null;
  private session = new DuckSession();
  private tween: VolumeTweenHandle | null = null;

  registerBridge(bridge: MusicVolumeBridge) {
    this.bridge = bridge;
  }

  unregisterBridge(bridge: MusicVolumeBridge) {
    if (this.bridge === bridge) {
      this.forceRestoreImmediate();
      this.bridge = null;
    }
  }

  registerPlayer(player: YT.Player | null) {
    this.player = player;
  }

  get isDucked(): boolean {
    return this.session.isDucked;
  }

  getActiveReasons(): DuckReason[] {
    return this.session.activeReasons;
  }

  /**
   * Hold duck for a named reason. First reason starts the duck animation;
   * additional reasons are no-ops for volume (no flash).
   */
  acquire(reason: DuckReason): void {
    const bridge = this.bridge;
    const userSettings = bridge?.getSettings() ?? {
      volume: 80,
      muted: false,
    };
    const liveVolume = this.readPlayerVolume() ?? userSettings.volume;
    const liveMuted = this.readPlayerMuted() ?? userSettings.muted;
    const live: LocalVolumeSettings = {
      volume: liveVolume,
      muted: liveMuted,
    };

    const { shouldAnimate, target, becameActive } = this.session.acquire(
      reason,
      userSettings,
      live,
    );

    if (!becameActive || !shouldAnimate) {
      return;
    }

    this.cancelTween();

    this.tween = animateVolume(
      live.volume,
      target.volume,
      VOICE_DUCK_DURATION_MS,
      (volume) => {
        this.applyTransient({ volume: Math.round(volume), muted: false });
      },
      () => {
        this.applyTransient(target);
        this.tween = null;
      },
    );
  }

  /**
   * Release a named reason. Restores volume only when no reasons remain.
   */
  release(reason: DuckReason): void {
    const { shouldRestore, snapshot } = this.session.release(reason);
    if (!shouldRestore || !snapshot) {
      return;
    }
    this.restoreAnimated(snapshot);
  }

  /** Voice-playback convenience (same as acquire("voice-playback")). */
  retainDuck(): void {
    this.acquire("voice-playback");
  }

  /** Voice-playback convenience (same as release("voice-playback")). */
  releaseDuck(): void {
    this.release("voice-playback");
  }

  /** Immediate restore of all reasons (unmount / leave room). */
  forceRestoreImmediate(): void {
    this.cancelTween();
    const snap = this.session.forceClear();
    if (snap) {
      this.applyTransient(snap);
    }
  }

  /** Test helper — reset singleton state. */
  resetForTests(): void {
    this.cancelTween();
    this.session.forceClear();
    this.bridge = null;
    this.player = null;
  }

  private restoreAnimated(snap: LocalVolumeSettings): void {
    this.cancelTween();

    const fromVol = this.readPlayerVolume() ?? snap.volume;

    if (
      fromVol === snap.volume &&
      (this.readPlayerMuted() ?? snap.muted) === snap.muted
    ) {
      this.applyTransient(snap);
      return;
    }

    this.tween = animateVolume(
      fromVol,
      snap.volume,
      VOICE_DUCK_DURATION_MS,
      (volume) => {
        this.applyTransient({
          volume: Math.round(volume),
          muted: false,
        });
      },
      () => {
        this.applyTransient(snap);
        this.tween = null;
      },
    );
  }

  private applyTransient(settings: LocalVolumeSettings) {
    if (this.bridge) {
      this.bridge.applyToPlayer(settings);
      return;
    }

    if (this.player) {
      applyLocalVolumeToPlayer(this.player, settings);
    }
  }

  private readPlayerVolume(): number | null {
    try {
      const vol = this.player?.getVolume?.();
      return typeof vol === "number" ? vol : null;
    } catch {
      return null;
    }
  }

  private readPlayerMuted(): boolean | null {
    try {
      if (typeof this.player?.isMuted === "function") {
        return this.player.isMuted();
      }
      return null;
    } catch {
      return null;
    }
  }

  private cancelTween() {
    this.tween?.cancel();
    this.tween = null;
  }
}

export const musicDucker = new MusicDucker();
