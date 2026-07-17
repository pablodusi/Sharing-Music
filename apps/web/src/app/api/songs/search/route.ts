import { NextResponse } from "next/server";
import {
  isYouTubeQuotaExceeded,
  MIN_SEARCH_QUERY_LENGTH,
  QUOTA_EXCEEDED_MESSAGE,
  youtubeSearchErrorResponse,
} from "@/lib/song-search-client";
import type { SongSearchResult } from "@/lib/song-search";
import type { Track } from "@/lib/types";

export const runtime = "nodejs";

/** YouTube category id for Music. */
const MUSIC_CATEGORY_ID = "10";

/** Skip live mixes / long uploads — keep results closer to song length. */
const MAX_DURATION_SECONDS = 10 * 60;

type YouTubeSearchItem = {
  id?: { videoId?: string };
};

type YouTubeVideoItem = {
  id?: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    categoryId?: string;
  };
  contentDetails?: {
    duration?: string;
  };
};

/** Parse YouTube ISO-8601 durations like PT3M45S or PT1H2M10S. */
export function parseYouTubeDurationSeconds(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) {
    return 0;
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * GET /api/songs/search?q=...
 * Music-focused YouTube Data API search (category Music + duration filter).
 * Requires YOUTUBE_API_KEY. No mock fallback.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();

  if (query.length < MIN_SEARCH_QUERY_LENGTH) {
    return NextResponse.json({
      results: [] as SongSearchResult[],
      source: "none",
      error: null,
      message: `Type at least ${MIN_SEARCH_QUERY_LENGTH} characters.`,
    });
  }

  const apiKey = process.env.YOUTUBE_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      {
        results: [] as SongSearchResult[],
        source: "error",
        error: "missing_api_key",
        message:
          "YouTube search is not configured. Add YOUTUBE_API_KEY to apps/web/.env.local and restart the dev server.",
      },
      { status: 503 },
    );
  }

  try {
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("videoCategoryId", MUSIC_CATEGORY_ID);
    searchUrl.searchParams.set("videoEmbeddable", "true");
    searchUrl.searchParams.set("safeSearch", "moderate");
    // Fetch extra candidates so duration filtering still leaves enough songs.
    searchUrl.searchParams.set("maxResults", "20");
    searchUrl.searchParams.set("q", `${query} song`);
    searchUrl.searchParams.set("key", apiKey);

    const searchResponse = await fetch(searchUrl.toString(), {
      next: { revalidate: 0 },
    });

    if (!searchResponse.ok) {
      const body = await searchResponse.text();
      console.error("YouTube search failed", searchResponse.status, body);
      const errorPayload = youtubeSearchErrorResponse(
        searchResponse.status,
        body,
      );
      return NextResponse.json(errorPayload, {
        status: errorPayload.error === "quota_exceeded" ? 429 : 502,
      });
    }

    const searchData = (await searchResponse.json()) as {
      items?: YouTubeSearchItem[];
    };
    const videoIds = (searchData.items ?? [])
      .map((item) => item.id?.videoId)
      .filter((id): id is string => Boolean(id));

    if (videoIds.length === 0) {
      return NextResponse.json({
        results: [] as SongSearchResult[],
        source: "youtube",
        error: null,
        message: "No music videos found.",
      });
    }

    const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    detailsUrl.searchParams.set("part", "snippet,contentDetails");
    detailsUrl.searchParams.set("id", videoIds.join(","));
    detailsUrl.searchParams.set("key", apiKey);

    const detailsResponse = await fetch(detailsUrl.toString(), {
      next: { revalidate: 0 },
    });

    if (!detailsResponse.ok) {
      const body = await detailsResponse.text();
      console.error("YouTube videos.list failed", detailsResponse.status, body);
      if (isYouTubeQuotaExceeded(detailsResponse.status, body)) {
        return NextResponse.json(
          {
            results: [] as SongSearchResult[],
            source: "error",
            error: "quota_exceeded",
            message: QUOTA_EXCEEDED_MESSAGE,
          },
          { status: 429 },
        );
      }
      return NextResponse.json(
        {
          results: [] as SongSearchResult[],
          source: "error",
          error: "youtube_api_error",
          message: "Could not load video details from YouTube.",
        },
        { status: 502 },
      );
    }

    const detailsData = (await detailsResponse.json()) as {
      items?: YouTubeVideoItem[];
    };

    const results: SongSearchResult[] = [];

    for (const item of detailsData.items ?? []) {
      const videoId = item.id;
      if (!videoId) {
        continue;
      }

      // Prefer Music category when the detail response includes it.
      if (
        item.snippet?.categoryId &&
        item.snippet.categoryId !== MUSIC_CATEGORY_ID
      ) {
        continue;
      }

      const durationIso = item.contentDetails?.duration ?? "";
      const durationSeconds = parseYouTubeDurationSeconds(durationIso);

      // Skip very short clips and long mixes / livestreams dumps.
      if (durationSeconds < 45 || durationSeconds > MAX_DURATION_SECONDS) {
        continue;
      }

      const track: Track = {
        id: `yt-${videoId}`,
        title: item.snippet?.title ?? "Untitled",
        artist: item.snippet?.channelTitle ?? "YouTube",
        album: "YouTube",
        durationMs: durationSeconds * 1000,
        youtubeVideoId: videoId,
        coverColor: "#a78bfa",
      };

      results.push({ track, source: "youtube" });

      if (results.length >= 8) {
        break;
      }
    }

    return NextResponse.json({
      results,
      source: "youtube",
      error: null,
      message: results.length === 0 ? "No suitable music tracks found." : null,
    });
  } catch (error) {
    console.error("YouTube search error", error);
    return NextResponse.json(
      {
        results: [] as SongSearchResult[],
        source: "error",
        error: "youtube_api_error",
        message:
          "Could not reach the YouTube API. Check your network and try again.",
      },
      { status: 502 },
    );
  }
}
