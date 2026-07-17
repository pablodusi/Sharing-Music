"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import {
  formatAddBlockMessage,
  type AddBlockReason,
} from "@/lib/queue";
import { ROOM_RULES } from "@/lib/room-rules";
import {
  createDebouncedSearchRunner,
  fetchSongSearch,
  isSearchableQuery,
  QUOTA_EXCEEDED_MESSAGE,
  SEARCH_DEBOUNCE_MS,
  songSearchCache,
} from "@/lib/song-search-client";
import type { SongSearchResult } from "@/lib/song-search";
import { youtubeThumbnailUrl } from "@/lib/youtube";
import type { Track } from "@/lib/types";

const MAX_VISIBLE_RESULTS = 8;

type SongSearchPanelProps = {
  roomHasCurrentTrack: boolean;
  blockedVideoIds: Set<string>;
  /** Null when the user can still add; otherwise why they are capped. */
  addBlockReason: AddBlockReason | null;
  onSelect: (track: Track) => void;
};

function queueLimitHint(): string {
  const max = ROOM_RULES.maxQueuedSongsPerUser;
  const songWord = max === 1 ? "song" : "songs";
  const base = `Up to ${max} ${songWord} in Up Next per person.`;
  if (ROOM_RULES.blockAddWhileOwnSongPlaying) {
    return `${base} Wait until yours finishes if it is Now playing.`;
  }
  return `${base} You can keep adding while yours is playing.`;
}

export function SongSearchPanel({
  roomHasCurrentTrack,
  blockedVideoIds,
  addBlockReason,
  onSelect,
}: SongSearchPanelProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SongSearchResult[]>([]);
  const [source, setSource] = useState<"youtube" | "none" | "error">("none");
  const [hint, setHint] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const atLimit = addBlockReason !== null;
  const limitMessage = addBlockReason
    ? formatAddBlockMessage(addBlockReason)
    : null;

  const trimmedQuery = query.trim();
  const canSearch = isSearchableQuery(trimmedQuery);
  const visibleResults = results.slice(0, MAX_VISIBLE_RESULTS);
  const showEmptyState =
    canSearch && !loading && !apiError && visibleResults.length === 0;
  const shouldShowPanel =
    panelOpen &&
    canSearch &&
    (loading || apiError !== null || visibleResults.length > 0 || showEmptyState);

  const runnerRef = useRef(
    createDebouncedSearchRunner(SEARCH_DEBOUNCE_MS),
  );

  useEffect(() => {
    const runner = runnerRef.current;

    if (!canSearch) {
      runner.cancel();
      setResults([]);
      setSource("none");
      setHint(null);
      setApiError(null);
      setLoading(false);
      setPanelOpen(false);
      return () => {
        runner.cancel();
      };
    }

    setPanelOpen(true);
    setLoading(true);

    runner.schedule(async (signal) => {
      try {
        const data = await fetchSongSearch(trimmedQuery, {
          signal,
          cache: songSearchCache,
        });

        if (signal.aborted) {
          return;
        }

        if (data.source === "error") {
          setResults([]);
          setSource("error");
          setApiError(
            data.error === "quota_exceeded"
              ? (data.message ?? QUOTA_EXCEEDED_MESSAGE)
              : (data.message ??
                  "YouTube search is unavailable. Configure YOUTUBE_API_KEY."),
          );
          setHint(null);
          return;
        }

        setResults((data.results ?? []).slice(0, MAX_VISIBLE_RESULTS));
        setSource(data.source === "youtube" ? "youtube" : "none");
        setApiError(null);
        setHint(data.message);
      } catch (error) {
        if ((error as Error).name === "AbortError" || signal.aborted) {
          return;
        }
        setResults([]);
        setSource("error");
        setApiError("Search failed. Try again.");
        setHint(null);
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    });

    return () => {
      runner.cancel();
    };
  }, [canSearch, trimmedQuery]);

  useEffect(() => {
    if (!panelOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent | PointerEvent) {
      const root = rootRef.current;
      if (!root || !(event.target instanceof Node)) {
        return;
      }
      if (!root.contains(event.target)) {
        setPanelOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPanelOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [panelOpen]);

  function closePanel() {
    setPanelOpen(false);
  }

  function clearSearch() {
    setQuery("");
    setFeedback(null);
    setPanelOpen(false);
    setResults([]);
    setApiError(null);
    setHint(null);
    setSource("none");
  }

  function handleSelect(track: Track) {
    if (addBlockReason) {
      setFeedback(formatAddBlockMessage(addBlockReason));
      return;
    }

    if (
      blockedVideoIds.has(track.id) ||
      blockedVideoIds.has(track.youtubeVideoId)
    ) {
      setFeedback("Already in this room.");
      return;
    }

    onSelect(track);
    setFeedback(
      roomHasCurrentTrack
        ? `Added “${track.title}” to Up Next.`
        : `Started “${track.title}” as Now playing.`,
    );
  }

  return (
    <section className="relative z-30">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          {roomHasCurrentTrack ? "Add a song" : "Start the room"}
        </h2>
        <p className="mt-1 text-xs text-muted">{queueLimitHint()}</p>
      </div>

      {limitMessage ? (
        <p
          role="status"
          className="mb-3 rounded-xl border border-accent/40 bg-accent/15 px-3 py-2.5 text-sm font-medium text-foreground"
        >
          {limitMessage}
        </p>
      ) : null}

      <div ref={rootRef} className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setFeedback(null);
            }}
            onFocus={() => {
              if (canSearch) {
                setPanelOpen(true);
              }
            }}
            placeholder="Search songs or artists on YouTube…"
            className={`w-full border border-border bg-black/20 py-2.5 pl-10 pr-10 text-sm text-foreground outline-none transition focus:border-accent/50 focus:ring-2 focus:ring-accent/20 ${
              shouldShowPanel
                ? "rounded-t-xl rounded-b-none border-b-transparent"
                : "rounded-xl"
            }`}
            role="combobox"
            aria-expanded={shouldShowPanel}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-haspopup="listbox"
          />
          {query.length > 0 ? (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted transition hover:bg-white/10 hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div
          className="search-results-dropdown absolute left-0 right-0 top-full z-50 w-full"
          data-open={shouldShowPanel ? "true" : "false"}
          aria-hidden={!shouldShowPanel}
        >
          <div className="search-results-dropdown-inner">
            <div
              id={listboxId}
              role="listbox"
              className="mt-0 overflow-hidden rounded-b-xl rounded-t-none border border-t-0 border-border bg-surface-elevated shadow-glow"
            >
              <div className="flex items-center justify-between gap-2 border-b border-border/80 px-3 py-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-muted">
                  {loading ? <span>Searching…</span> : null}
                  {!loading && source === "youtube" ? (
                    <span className="rounded-full border border-accent/40 px-2 py-0.5 text-accent">
                      YouTube Data API
                    </span>
                  ) : null}
                  {!loading && hint && !apiError ? (
                    <span className="truncate">{hint}</span>
                  ) : null}
                  {!loading &&
                  !apiError &&
                  visibleResults.length > 0 &&
                  !hint ? (
                    <span>
                      {visibleResults.length} result
                      {visibleResults.length === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={closePanel}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted transition hover:border-accent/40 hover:text-foreground"
                  aria-label="Close search results"
                >
                  <X className="h-3 w-3" />
                  Close
                </button>
              </div>

              {apiError ? (
                <p className="px-3 py-3 text-xs text-danger">{apiError}</p>
              ) : null}

              {showEmptyState ? (
                <p className="px-3 py-3 text-sm text-muted">No songs found.</p>
              ) : null}

              {visibleResults.length > 0 ? (
                <ul className="space-y-0">
                  {visibleResults.map(({ track }) => {
                    const alreadyInRoom =
                      blockedVideoIds.has(track.id) ||
                      blockedVideoIds.has(track.youtubeVideoId);
                    const disabled = alreadyInRoom;

                    return (
                      <li
                        key={track.id}
                        role="option"
                        aria-selected={false}
                        className="flex items-center gap-3 border-b border-border/60 px-3 py-2.5 last:border-b-0"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={youtubeThumbnailUrl(track.youtubeVideoId)}
                          alt=""
                          className="h-10 w-14 shrink-0 rounded-md object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {track.title}
                          </p>
                          <p className="truncate text-xs text-muted">
                            {track.artist}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => handleSelect(track)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-black/20 px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {alreadyInRoom
                            ? "In room"
                            : atLimit
                              ? "Limit"
                              : roomHasCurrentTrack
                                ? "Add"
                                : "Play"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {feedback ? (
        <p className="mt-2 text-xs text-accent" role="status">
          {feedback}
        </p>
      ) : null}
    </section>
  );
}
