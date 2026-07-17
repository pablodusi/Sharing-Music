import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDebouncedSearchRunner,
  fetchSongSearch,
  isSearchableQuery,
  isYouTubeQuotaExceeded,
  MIN_SEARCH_QUERY_LENGTH,
  QUOTA_EXCEEDED_MESSAGE,
  SEARCH_CACHE_TTL_MS,
  SEARCH_DEBOUNCE_MS,
  SongSearchCache,
  youtubeSearchErrorResponse,
} from "./song-search-client";

describe("song search query gates", () => {
  it("requires at least 3 characters", () => {
    assert.equal(MIN_SEARCH_QUERY_LENGTH, 3);
    assert.equal(isSearchableQuery(""), false);
    assert.equal(isSearchableQuery("ab"), false);
    assert.equal(isSearchableQuery("  ab "), false);
    assert.equal(isSearchableQuery("abc"), true);
    assert.equal(isSearchableQuery("  abba  "), true);
  });

  it("uses a 700 ms debounce", () => {
    assert.equal(SEARCH_DEBOUNCE_MS, 700);
  });

  it("caches for at least 10 minutes", () => {
    assert.ok(SEARCH_CACHE_TTL_MS >= 10 * 60 * 1000);
  });
});

describe("SongSearchCache", () => {
  it("reuses identical queries within the TTL", () => {
    let now = 1_000;
    const cache = new SongSearchCache(SEARCH_CACHE_TTL_MS, () => now);
    const payload = {
      results: [],
      source: "youtube" as const,
      error: null,
      message: null,
    };

    cache.set("Radiohead", payload);
    assert.deepEqual(cache.get("radiohead"), payload);
    assert.deepEqual(cache.get("  RADIOHEAD  "), payload);

    now += SEARCH_CACHE_TTL_MS - 1;
    assert.deepEqual(cache.get("radiohead"), payload);

    now += 2;
    assert.equal(cache.get("radiohead"), undefined);
  });
});

describe("createDebouncedSearchRunner", () => {
  it("waits for the debounce delay before running", async () => {
    const scheduled: Array<{ delay: number; fn: () => void }> = [];
    const runner = createDebouncedSearchRunner(700, {
      setTimeout: ((fn: () => void, delay: number) => {
        scheduled.push({ delay, fn });
        return scheduled.length as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
      clearTimeout: (() => undefined) as typeof clearTimeout,
    });

    let ran = 0;
    runner.schedule(() => {
      ran += 1;
    });

    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].delay, 700);
    assert.equal(ran, 0);
    scheduled[0].fn();
    assert.equal(ran, 1);
  });

  it("cancels the previous timer and aborts the prior signal when typing continues", async () => {
    const timers = new Map<number, () => void>();
    let nextId = 1;
    const cleared: number[] = [];

    const runner = createDebouncedSearchRunner(700, {
      setTimeout: ((fn: () => void) => {
        const id = nextId;
        nextId += 1;
        timers.set(id, fn);
        return id as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
      clearTimeout: ((id: ReturnType<typeof setTimeout>) => {
        cleared.push(id as unknown as number);
        timers.delete(id as unknown as number);
      }) as typeof clearTimeout,
    });

    const signals: AbortSignal[] = [];
    const runs: string[] = [];

    runner.schedule(async (signal) => {
      signals.push(signal);
      runs.push("first");
    });
    runner.schedule(async (signal) => {
      signals.push(signal);
      runs.push("second");
    });

    assert.equal(cleared.length, 1);
    assert.equal(timers.size, 1);

    // Flush the latest scheduled task only.
    const remaining = [...timers.values()];
    assert.equal(remaining.length, 1);
    remaining[0]();
    await Promise.resolve();

    assert.deepEqual(runs, ["second"]);
    assert.equal(signals.length, 1);
    assert.equal(signals[0].aborted, false);

    runner.cancel();
    // After cancel, a new schedule's previous controller is aborted on replace —
    // cancel itself aborts the active controller from the completed run's leftover.
  });

  it("aborts an in-flight signal when schedule is called again", async () => {
    const timers = new Map<number, () => void>();
    let nextId = 1;

    const runner = createDebouncedSearchRunner(0, {
      setTimeout: ((fn: () => void) => {
        const id = nextId;
        nextId += 1;
        // Run immediately for this test's delay=0 pattern, but store for control.
        queueMicrotask(fn);
        timers.set(id, fn);
        return id as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
      clearTimeout: ((id: ReturnType<typeof setTimeout>) => {
        timers.delete(id as unknown as number);
      }) as typeof clearTimeout,
    });

    let firstSignal: AbortSignal | null = null;
    const firstDone = new Promise<void>((resolve) => {
      runner.schedule(async (signal) => {
        firstSignal = signal;
        // Stay "in flight" until aborted by the next schedule.
        await new Promise<void>((r) => {
          signal.addEventListener("abort", () => r(), { once: true });
        });
        resolve();
      });
    });

    await new Promise((r) => setTimeout(r, 5));
    assert.ok(firstSignal);
    assert.equal(firstSignal!.aborted, false);

    runner.schedule(async () => {
      /* replaces previous */
    });

    await firstDone;
    assert.equal(firstSignal!.aborted, true);
  });
});

describe("fetchSongSearch cache and cancellation", () => {
  it("does not call fetch for queries shorter than 3 characters", async () => {
    let calls = 0;
    const result = await fetchSongSearch("ab", {
      cache: new SongSearchCache(),
      fetchImpl: (async () => {
        calls += 1;
        return new Response("{}");
      }) as typeof fetch,
    });
    assert.equal(calls, 0);
    assert.equal(result.source, "none");
    assert.match(result.message ?? "", /3 characters/);
  });

  it("reuses the cache for identical queries", async () => {
    let calls = 0;
    const cache = new SongSearchCache();
    const payload = {
      results: [
        {
          track: {
            id: "yt-1",
            title: "Song",
            artist: "Artist",
            album: "YouTube",
            durationMs: 120_000,
            youtubeVideoId: "abc1234",
          },
          source: "youtube" as const,
        },
      ],
      source: "youtube" as const,
      error: null,
      message: null,
    };

    const fetchImpl = (async () => {
      calls += 1;
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const first = await fetchSongSearch("beatles", { cache, fetchImpl });
    const second = await fetchSongSearch("Beatles", { cache, fetchImpl });

    assert.equal(calls, 1);
    assert.equal(first.results[0]?.track.title, "Song");
    assert.equal(second.results[0]?.track.title, "Song");
  });

  it("cancels in-flight fetch when the AbortSignal aborts", async () => {
    const cache = new SongSearchCache();
    const controller = new AbortController();

    const fetchImpl = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error("missing signal"));
          return;
        }
        signal.addEventListener(
          "abort",
          () => {
            const error = new Error("Aborted");
            error.name = "AbortError";
            reject(error);
          },
          { once: true },
        );
      });
    }) as typeof fetch;

    const pending = fetchSongSearch("radiohead", {
      cache,
      fetchImpl,
      signal: controller.signal,
    });

    controller.abort();
    await assert.rejects(pending, (error: Error) => error.name === "AbortError");
    assert.equal(cache.get("radiohead"), undefined);
  });
});

describe("quotaExceeded messaging", () => {
  it("detects quotaExceeded from YouTube error payloads", () => {
    const body = JSON.stringify({
      error: {
        code: 403,
        message: "The request cannot be completed because you have exceeded your quota.",
        errors: [{ reason: "quotaExceeded", domain: "youtube.quota" }],
      },
    });

    assert.equal(isYouTubeQuotaExceeded(403, body), true);
    const response = youtubeSearchErrorResponse(403, body);
    assert.equal(response.error, "quota_exceeded");
    assert.equal(response.message, QUOTA_EXCEEDED_MESSAGE);
    assert.doesNotMatch(response.message ?? "", /invalid API key/i);
    assert.doesNotMatch(response.message ?? "", /API key is valid/i);
  });

  it("keeps the generic key message for non-quota API failures", () => {
    const body = JSON.stringify({
      error: {
        code: 400,
        message: "API key not valid. Please pass a valid API key.",
        errors: [{ reason: "keyInvalid" }],
      },
    });
    const response = youtubeSearchErrorResponse(400, body);
    assert.equal(response.error, "youtube_api_error");
    assert.match(response.message ?? "", /API key is valid/);
  });
});
