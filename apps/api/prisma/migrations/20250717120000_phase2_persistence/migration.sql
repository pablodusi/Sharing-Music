-- Phase 2: guest identity, queue/votes, playback YouTube fields, voice message metadata.
-- Replaces playlist-based queue with room QueueItem + QueueVote.

-- Drop old playlist / music-provider playback columns
DROP TABLE IF EXISTS "playlist_items" CASCADE;
DROP TABLE IF EXISTS "playlists" CASCADE;

-- Users: support guests (optional auth0/email, guest_key)
ALTER TABLE "users" ALTER COLUMN "auth0_id" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "guest_key" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_guest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ALTER COLUMN "display_name" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_guest_key_key" ON "users"("guest_key");

-- Playback: YouTube-oriented shared state
ALTER TABLE "room_playback" DROP COLUMN IF EXISTS "track_id";
ALTER TABLE "room_playback" DROP COLUMN IF EXISTS "track_provider";
ALTER TABLE "room_playback" ADD COLUMN IF NOT EXISTS "youtube_video_id" TEXT;
ALTER TABLE "room_playback" ADD COLUMN IF NOT EXISTS "track_album" TEXT;
ALTER TABLE "room_playback" ADD COLUMN IF NOT EXISTS "duration_ms" INTEGER;
ALTER TABLE "room_playback" ADD COLUMN IF NOT EXISTS "added_by_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "room_playback"
    ADD CONSTRAINT "room_playback_added_by_id_fkey"
    FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Queue
CREATE TABLE IF NOT EXISTS "queue_items" (
  "id" TEXT NOT NULL,
  "room_id" TEXT NOT NULL,
  "youtube_video_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "artist" TEXT NOT NULL,
  "album" TEXT NOT NULL DEFAULT 'YouTube',
  "duration_ms" INTEGER NOT NULL,
  "added_by_id" TEXT NOT NULL,
  "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "queue_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "queue_items_room_id_added_at_idx" ON "queue_items"("room_id", "added_at");
CREATE INDEX IF NOT EXISTS "queue_items_room_id_youtube_video_id_idx" ON "queue_items"("room_id", "youtube_video_id");

DO $$ BEGIN
  ALTER TABLE "queue_items"
    ADD CONSTRAINT "queue_items_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "queue_items"
    ADD CONSTRAINT "queue_items_added_by_id_fkey"
    FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Votes (one per user per room)
CREATE TABLE IF NOT EXISTS "queue_votes" (
  "id" TEXT NOT NULL,
  "room_id" TEXT NOT NULL,
  "queue_item_id" TEXT NOT NULL,
  "voter_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "queue_votes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "queue_votes_room_id_voter_id_key" ON "queue_votes"("room_id", "voter_id");
CREATE INDEX IF NOT EXISTS "queue_votes_queue_item_id_idx" ON "queue_votes"("queue_item_id");

DO $$ BEGIN
  ALTER TABLE "queue_votes"
    ADD CONSTRAINT "queue_votes_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "queue_votes"
    ADD CONSTRAINT "queue_votes_queue_item_id_fkey"
    FOREIGN KEY ("queue_item_id") REFERENCES "queue_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "queue_votes"
    ADD CONSTRAINT "queue_votes_voter_id_fkey"
    FOREIGN KEY ("voter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Messages: optional author, VOICE type, audio URL metadata
ALTER TABLE "messages" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "messages" RENAME COLUMN "user_id" TO "author_id";

ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_user_id_fkey";
DO $$ BEGIN
  ALTER TABLE "messages"
    ADD CONSTRAINT "messages_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "audio_url" TEXT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "audio_duration_ms" INTEGER;

-- Extend MessageType enum with VOICE
DO $$ BEGIN
  ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'VOICE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
