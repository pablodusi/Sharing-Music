export {};

declare global {
  namespace YT {
    enum PlayerState {
      UNSTARTED = -1,
      ENDED = 0,
      PLAYING = 1,
      PAUSED = 2,
      BUFFERING = 3,
      CUED = 5,
    }

    interface PlayerOptions {
      height?: string | number;
      width?: string | number;
      videoId?: string;
      playerVars?: {
        autoplay?: 0 | 1;
        controls?: 0 | 1;
        disablekb?: 0 | 1;
        fs?: 0 | 1;
        modestbranding?: 0 | 1;
        rel?: 0 | 1;
        playsinline?: 0 | 1;
        iv_load_policy?: 1 | 3;
        origin?: string;
        start?: number;
      };
      events?: {
        onReady?: (event: PlayerEvent) => void;
        onStateChange?: (event: OnStateChangeEvent) => void;
        onError?: (event: OnErrorEvent) => void;
      };
    }

    interface PlayerEvent {
      target: Player;
    }

    interface OnStateChangeEvent {
      data: PlayerState;
      target: Player;
    }

    interface OnErrorEvent {
      data: number;
      target: Player;
    }

    class Player {
      constructor(elementId: string | HTMLElement, options: PlayerOptions);
      destroy(): void;
      playVideo(): void;
      pauseVideo(): void;
      stopVideo(): void;
      loadVideoById(
        videoId:
          | string
          | {
              videoId: string;
              startSeconds?: number;
              endSeconds?: number;
            },
      ): void;
      cueVideoById(
        videoId:
          | string
          | {
              videoId: string;
              startSeconds?: number;
              endSeconds?: number;
            },
      ): void;
      seekTo(seconds: number, allowSeekAhead?: boolean): void;
      getCurrentTime(): number;
      getDuration(): number;
      getPlayerState(): PlayerState;
      mute(): void;
      unMute(): void;
      isMuted(): boolean;
      setVolume(volume: number): void;
      getVolume(): number;
    }
  }

  const YT: {
    Player: typeof YT.Player;
    PlayerState: typeof YT.PlayerState;
  };
}
