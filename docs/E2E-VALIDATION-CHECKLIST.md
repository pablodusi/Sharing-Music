# MVP end-to-end validation checklist

Strict manual validation for Sharing Music after Phase 4.  
**Do not** add features, redesign UI, deploy, or enable Auth0 / lyrics / mobile / profiles / monetization while running this list.

Record every failure in [§ Failure log](#failure-log) with exact steps.

---

## 0. Prerequisites — Docker Desktop

- [ ] Windows: Docker Desktop installed and **running** (whale icon in the tray).
- [ ] `docker version` works in a terminal (Client + Server).
- [ ] WSL2 / virtualization enabled if Docker Desktop requires it.
- [ ] Repo cloned; from repo root: `npm install` completed without errors.
- [ ] Node.js ≥ 20 (`node -v`).

**Abort if Docker Engine is not running** — Postgres/Redis will not start.

---

## 1. Environment variables

### Root `.env` (API)

Copy if missing: `cp .env.example .env` (PowerShell: `Copy-Item .env.example .env`).

| Variable | Expected (local) | Verified |
|----------|------------------|----------|
| `PORT` | `3001` | [ ] |
| `CORS_ORIGINS` | includes `http://localhost:3000` | [ ] |
| `DATABASE_URL` | `postgresql://sharing_music:sharing_music@localhost:5432/sharing_music?schema=public` | [ ] |
| `REDIS_URL` | `redis://localhost:6379` | [ ] |
| `VOICE_UPLOAD_DIR` | `uploads/voice` | [ ] |

Auth0 vars may stay as placeholders for this MVP (guest flow only).

### `apps/web/.env.local`

| Variable | Expected (local) | Verified |
|----------|------------------|----------|
| `YOUTUBE_API_KEY` | valid key (search will 503 without it) | [ ] |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001/api/v1` | [ ] |
| `NEXT_PUBLIC_SOCKET_URL` | `http://localhost:3001` | [ ] |

Restart `npm run web:dev` after changing web env vars.

---

## 2. Start PostgreSQL and Redis

```bash
npm run db:up
docker compose ps
```

- [ ] Container `sharing-music-postgres` is **Up** (healthy preferred).
- [ ] Container `sharing-music-redis` is **Up** (healthy preferred).
- [ ] Ports `5432` and `6379` are listening locally.

---

## 3. Prisma migrations

```bash
npm run db:migrate
```

- [ ] Migrate completes without error (Phase 2 schema applied).
- [ ] If prompted for a migration name on a fresh DB, accept the existing migrations already in `apps/api/prisma/migrations/`.

Optional check: `npm run db:studio -w api` shows `Room`, `RoomMember`, `QueueItem`, `Message`, `RoomPlayback`, etc.

---

## 4. Start NestJS API and run smoke check

Terminal A:

```bash
npm run api:dev
```

- [ ] API logs show listening on port **3001**.
- [ ] No crash on Prisma/Redis connect.

**Smoke test (required before opening the frontend):**

```bash
npm run smoke
```

Expected: all `PASS` lines for Docker postgres/redis and `GET /api/v1/health` (status `ok`, which executes Postgres `SELECT 1` + Redis `PING`).

- [ ] `npm run smoke` exits **0**.

Manual equivalent:

```bash
curl http://localhost:3001/api/v1/health
# {"status":"ok","timestamp":"..."}
```

---

## 5. Start Next.js web app

Terminal B:

```bash
npm run web:dev
```

- [ ] Web available at `http://localhost:3000`.
- [ ] Home page loads public rooms (or empty state) **without** API error banner.
- [ ] Song search works only if `YOUTUBE_API_KEY` is set (otherwise note as known env gap, not a sync bug).

---

## 6. Create a room

**Window A — normal browser profile**

- [ ] Open `http://localhost:3000/create`.
- [ ] Name ≥ 3 characters → **Create and enter room**.
- [ ] Land on `/rooms/{id}` with status **connected** (no permanent error banner).
- [ ] You appear under **In the room** (host/owner).
- [ ] Copy the room URL for Window B.

---

## 7. Join from a second guest (incognito)

**Window B — Incognito / Private window** (different `localStorage` → different guest id)

- [ ] Paste the same `/rooms/{id}` URL.
- [ ] Room loads; **Joining room…** then connected.
- [ ] **Both windows** show **2 listening** (or matching member count).
- [ ] Participant list shows **both** display names (e.g. `Guest-xxxx`).

If both windows share the same profile, guest identity is shared — use Incognito.

---

## 8. Synchronized room state

Perform each action in one window; confirm the other updates without refresh.

### Participants
- [ ] New join appears on the other client (`member.joined`).
- [ ] Closing Incognito (last socket for that guest) eventually shows member leave / count drop (`member.left`) — allow a few seconds.

### Current song + queue
- [ ] Window A: search → play/add first track → **Now playing** appears in A and B.
- [ ] Window B: add a second track → **Up next** shows the same item (same title / order) in A and B.
- [ ] No duplicate queue rows for a single add.

### Votes
- [ ] With ≥ 2 queued songs, Window A votes for one → vote count / order updates in B.
- [ ] Window A votes for the other (move vote) → previous loses the vote; B matches.
- [ ] Cannot meaningfully vote own song (UI/server reject); no desync.

### Text chat
- [ ] A sends `"hello-from-A"` → B sees it once, same author label.
- [ ] B sends `"hello-from-B"` → A sees it once.

### System messages
- [ ] Server system events (join / queue / vote / now playing, as implemented) appear in **both** chats.
- [ ] Refresh does **not** duplicate the same system message id (no doubled join spam for the same event).

### Voice messages
- [ ] A records and sends a short voice note → B sees a playable bubble.
- [ ] B can play the audio (URL under `http://localhost:3001/uploads/voice/...`).
- [ ] Local music ducks while recording/playing voice **only on that browser** (see §10).

---

## 9. Refresh and reconnect restore snapshot

### Hard refresh
- [ ] In Window A: note now playing title, queue order, last chat + voice message.
- [ ] Hard refresh (Ctrl+Shift+R) Window A.
- [ ] After reconnect: same now playing, same queue, same messages (including voice), same vote state for that guest.
- [ ] Window B unchanged / still in sync.

### Reconnect (network)
- [ ] DevTools → Network → Offline (or disable Wi‑Fi briefly) on Window A until UI shows **Reconnecting…**.
- [ ] Go Online again.
- [ ] Banner clears; state matches server (compare to Window B). No stale optimistic duplicates.

---

## 10. Local volume and ducking (one browser only)

- [ ] Window A: lower volume slider / mute — Window B volume **unchanged**.
- [ ] Window A: record voice or play a voice bubble — A’s YouTube audio ducks; B’s music level **unchanged**.
- [ ] After duck ends on A, A restores to its saved preference; B still untouched.

---

## 11. Idempotent playback advance (two ENDED)

Setup: queue at least **two** songs after current now playing (or one in queue is enough to observe a single advance).

- [ ] Note `youtubeVideoId` / title of the **current** track in both windows.
- [ ] Let the track end **or** simulate both players firing `onEnded` close together (both windows must be playing the same video toward the end).
- [ ] **Exactly one** advance occurs: next track is the vote winner / oldest; previous track is gone from now playing.
- [ ] Queue does **not** skip two songs for one ending.
- [ ] Both windows show the **same** new now playing.

If flaky: repeat once and log timings in the failure log.

---

## 12. Voice files survive refresh

- [ ] Send a voice message; note the bubble still plays after §9 hard refresh.
- [ ] Optional: open the `audio` network URL or `http://localhost:3001/uploads/voice/...` directly — file still 200.
- [ ] File exists under `apps/api/uploads/voice/` on disk.

---

## 13. Automated unit/socket tests (optional complement)

Not a substitute for this checklist, but useful:

```bash
npm run test -w api
npm run test -w web
```

- [ ] API tests pass (includes two-socket gateway cases).
- [ ] Web tests pass (includes snapshot/reconnect/vote/voice URL mapping).

---

## Command sequence (quick path)

```bash
# Once per machine
# Install Docker Desktop, then:
npm install
cp .env.example .env
# Create apps/web/.env.local with YOUTUBE_API_KEY + NEXT_PUBLIC_* (see §1)

npm run db:up
npm run db:migrate

# Terminal A
npm run api:dev

# Terminal B (after API is up)
npm run smoke

# Terminal C
npm run web:dev
# Open http://localhost:3000 — then follow §6–§12
```

---

## Failure log

Copy a block per failure. Do not continue to “pass” a section that failed unless retested.

### Failure template

```text
Date / time:
Section (e.g. §8 Votes):
Expected:
Actual:
Window A (profile / URL):
Window B (incognito / URL):
Room id:
Guest A id (localStorage sharing-music:guest-id):
Guest B id:
Exact steps to reproduce:
1.
2.
3.
API console errors:
Browser console errors (A/B):
Network failing request (method, URL, status, body):
Screenshot / notes:
Pass after retry? (yes/no):
```

### Log entries

_(empty — fill during the run)_

---

## Sign-off

| Role | Name | Date | Result |
|------|------|------|--------|
| Runner | | | Pass / Fail |
| Notes | | | |

**Stop here.** Do not start Phase 5 feature work, deployment, or Auth0 from this checklist.
