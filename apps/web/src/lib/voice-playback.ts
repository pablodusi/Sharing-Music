type StopHandler = () => void;

/**
 * Ensures only one voice message plays at a time.
 * Stopping a previous clip does not release music ducking —
 * the new clip calls retainDuck again (idempotent).
 */
class VoicePlaybackCoordinator {
  private activeId: string | null = null;
  private stopHandlers = new Map<string, StopHandler>();

  register(id: string, onForceStop: StopHandler) {
    this.stopHandlers.set(id, onForceStop);
    return () => {
      this.stopHandlers.delete(id);
      if (this.activeId === id) {
        this.activeId = null;
      }
    };
  }

  /** Claim playback; force-stops any other active voice message. */
  claim(id: string) {
    if (this.activeId && this.activeId !== id) {
      const stop = this.stopHandlers.get(this.activeId);
      stop?.();
    }
    this.activeId = id;
  }

  /** Clear active id when this message pauses / ends on its own. */
  release(id: string) {
    if (this.activeId === id) {
      this.activeId = null;
    }
  }

  getActiveId() {
    return this.activeId;
  }
}

export const voicePlaybackCoordinator = new VoicePlaybackCoordinator();
