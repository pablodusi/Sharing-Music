# Sharing Music — Web Frontend

Next.js web app for Sharing Music. Rooms start empty; playback uses the
**YouTube IFrame Player** and search uses the **YouTube Data API v3**.

No MP3s, SoundHelix, mock song catalogs, or downloads.

## Requirements

- Node.js 20+
- npm 10+
- A YouTube Data API v3 key

## Run locally

```bash
npm install
```

Create `apps/web/.env.local` (never commit real keys):

```bash
YOUTUBE_API_KEY=your_key_here
```

Enable **YouTube Data API v3** for that key in Google Cloud Console.

```bash
npm run web:dev
```

Open [http://localhost:3000](http://localhost:3000).

Without `YOUTUBE_API_KEY`, search shows a clear error and returns no results.

## Behavior

- Rooms start with **no song playing**
- Search YouTube → first pick becomes **Now playing** immediately (no voting)
- Later picks go to **Up Next**, sorted by **votes desc**, then **oldest `addedAt`** on ties
- **One active vote per user** (voting again moves it)
- Up to **3** queued songs per user; Add stays open and shows a clear message at the limit
- You **can** keep adding while your own song is Now playing (until the queue cap)
- You cannot vote on your own queued song
- You can remove your song only if it still has **zero votes**
- Listeners cannot play / pause / seek / skip (local mute + volume only)
- Played songs leave the room (not recycled)

### Tunable limits

Edit **`apps/web/src/lib/room-rules.ts`** (current defaults):

| Constant | Default | Meaning |
|----------|---------|---------|
| `maxQueuedSongsPerUser` | `3` | How many songs one user may have in Up Next |
| `blockAddWhileOwnSongPlaying` | `false` | Block adding while your song is Now playing |
| `maxActiveVotesPerUser` | `1` | Active votes per user (`1` = move-your-vote) |

Search uses the Music category and skips videos longer than 10 minutes.

## How to test

1. Set `YOUTUBE_API_KEY` in `apps/web/.env.local` and restart.
2. Open a room — see empty state: “No song is playing yet”.
3. Search e.g. `californication` — results come from YouTube.
4. Click **Play** on a result — it starts as Now playing.
5. Search again and **Add** — goes to Up Next (up to 3 per user; allowed while yours is playing).
6. At the 4th add, expect a clear limit message.
7. Remove `YOUTUBE_API_KEY`, restart, search — expect an error about the missing key.

## Secrets

| Variable | Where | Notes |
|----------|--------|--------|
| `YOUTUBE_API_KEY` | `apps/web/.env.local` | Server-only. Used by `/api/songs/search`. Never `NEXT_PUBLIC_`. |
