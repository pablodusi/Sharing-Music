const YT_SCRIPT_SRC = "https://www.youtube.com/iframe_api";

let loadPromise: Promise<void> | null = null;

declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** Load the official YouTube IFrame Player API script once. */
export function loadYouTubeIframeAPI(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API requires a browser"));
  }

  if (window.YT?.Player) {
    return Promise.resolve();
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${YT_SCRIPT_SRC}"]`,
    );

    if (existing) {
      return;
    }

    const script = document.createElement("script");
    script.src = YT_SCRIPT_SRC;
    script.async = true;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Failed to load YouTube IFrame API"));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function youtubeThumbnailUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
