import type { SongSearchResult } from "./song-search";

export const SEARCH_DEBOUNCE_MS = 700;
export const MIN_SEARCH_QUERY_LENGTH = 3;
/** In-memory cache TTL for identical search queries. */
export const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;

export const QUOTA_EXCEEDED_MESSAGE =
  "The daily YouTube search quota has been reached. Try again after the quota resets (usually within 24 hours).";

export type SongSearchApiResponse = {
  results: SongSearchResult[];
  source: "youtube" | "none" | "error";
  error: string | null;
  message: string | null;
};

export function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isSearchableQuery(query: string): boolean {
  return query.trim().length >= MIN_SEARCH_QUERY_LENGTH;
}

type CacheEntry = {
  expiresAt: number;
  value: SongSearchApiResponse;
};

export class SongSearchCache {
  private readonly store = new Map<string, CacheEntry>();

  constructor(
    private readonly ttlMs: number = SEARCH_CACHE_TTL_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(query: string): SongSearchApiResponse | undefined {
    const key = normalizeSearchQuery(query);
    if (!key) {
      return undefined;
    }
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(query: string, value: SongSearchApiResponse): void {
    const key = normalizeSearchQuery(query);
    if (!key) {
      return;
    }
    this.store.set(key, {
      value,
      expiresAt: this.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

/** Shared browser cache for SongSearchPanel. */
export const songSearchCache = new SongSearchCache();

/**
 * Detect YouTube Data API quota exhaustion from HTTP status + body.
 */
export function isYouTubeQuotaExceeded(
  status: number,
  bodyText: string,
): boolean {
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: {
        errors?: Array<{ reason?: string }>;
        message?: string;
      };
    };
    const reasons = parsed.error?.errors?.map((e) => e.reason) ?? [];
    if (
      reasons.includes("quotaExceeded") ||
      reasons.includes("dailyLimitExceeded")
    ) {
      return true;
    }
    const message = parsed.error?.message ?? "";
    if (/quota/i.test(message) && /exceed/i.test(message)) {
      return true;
    }
  } catch {
    if (/quotaExceeded/i.test(bodyText) || /dailyLimitExceeded/i.test(bodyText)) {
      return true;
    }
  }
  return (
    (status === 403 || status === 429) &&
    (/quotaExceeded/i.test(bodyText) || /dailyLimitExceeded/i.test(bodyText))
  );
}

export function youtubeSearchErrorResponse(
  status: number,
  bodyText: string,
): SongSearchApiResponse {
  if (isYouTubeQuotaExceeded(status, bodyText)) {
    return {
      results: [],
      source: "error",
      error: "quota_exceeded",
      message: QUOTA_EXCEEDED_MESSAGE,
    };
  }

  return {
    results: [],
    source: "error",
    error: "youtube_api_error",
    message:
      "YouTube search failed. Check that your API key is valid and the YouTube Data API v3 is enabled.",
  };
}

type FetchSongSearchOptions = {
  signal?: AbortSignal;
  cache?: SongSearchCache;
  fetchImpl?: typeof fetch;
};

/**
 * Fetch song search results, reusing an in-memory cache and honouring AbortSignal.
 */
export async function fetchSongSearch(
  query: string,
  options: FetchSongSearchOptions = {},
): Promise<SongSearchApiResponse> {
  const trimmed = query.trim();
  if (!isSearchableQuery(trimmed)) {
    return {
      results: [],
      source: "none",
      error: null,
      message: `Type at least ${MIN_SEARCH_QUERY_LENGTH} characters.`,
    };
  }

  if (options.signal?.aborted) {
    const error = new Error("Aborted");
    error.name = "AbortError";
    throw error;
  }

  const cache = options.cache ?? songSearchCache;
  const cached = cache.get(trimmed);
  if (cached) {
    return cached;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `/api/songs/search?q=${encodeURIComponent(trimmed)}`,
    { signal: options.signal },
  );

  if (options.signal?.aborted) {
    const error = new Error("Aborted");
    error.name = "AbortError";
    throw error;
  }

  const data = (await response.json()) as SongSearchApiResponse;
  cache.set(trimmed, data);
  return data;
}

type DebounceTimers = {
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
};

/**
 * Debounced runner that cancels the previous timer and AbortController when
 * `schedule` is called again before the delay elapses.
 */
export function createDebouncedSearchRunner(
  delayMs: number = SEARCH_DEBOUNCE_MS,
  timers: DebounceTimers = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  },
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;

  return {
    get delayMs() {
      return delayMs;
    },
    schedule(task: (signal: AbortSignal) => void | Promise<void>): void {
      if (timer !== null) {
        timers.clearTimeout(timer);
        timer = null;
      }
      if (controller) {
        controller.abort();
        controller = null;
      }

      const next = new AbortController();
      controller = next;
      timer = timers.setTimeout(() => {
        timer = null;
        void Promise.resolve(task(next.signal)).catch((error: unknown) => {
          if ((error as Error)?.name === "AbortError") {
            return;
          }
          throw error;
        });
      }, delayMs);
    },
    cancel(): void {
      if (timer !== null) {
        timers.clearTimeout(timer);
        timer = null;
      }
      if (controller) {
        controller.abort();
        controller = null;
      }
    },
  };
}
