export type LocalVolumeSettings = {
  /** 0–100, YouTube player scale. */
  volume: number;
  muted: boolean;
};

const STORAGE_KEY = "sharing-music:local-volume";
const DEFAULT_SETTINGS: LocalVolumeSettings = {
  volume: 80,
  muted: false,
};

function isBrowser() {
  return typeof window !== "undefined";
}

export function loadLocalVolume(): LocalVolumeSettings {
  if (!isBrowser()) {
    return DEFAULT_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<LocalVolumeSettings>;
    const volume = Number(parsed.volume);
    return {
      volume:
        Number.isFinite(volume) && volume >= 0 && volume <= 100
          ? Math.round(volume)
          : DEFAULT_SETTINGS.volume,
      muted: Boolean(parsed.muted),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveLocalVolume(settings: LocalVolumeSettings) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** Apply saved local volume to a YouTube player instance. */
export function applyLocalVolumeToPlayer(
  player: YT.Player,
  settings: LocalVolumeSettings,
) {
  if (typeof player.setVolume === "function") {
    player.setVolume(settings.volume);
  }

  if (settings.muted) {
    player.mute?.();
  } else {
    player.unMute?.();
  }
}
