"use client";

import Link from "next/link";
import { ArrowLeft, Headphones, RefreshCw, WifiOff } from "lucide-react";
import { ChatPanel } from "@/components/ChatPanel";
import { ParticipantList } from "@/components/ParticipantList";
import { PlayerPanel } from "@/components/PlayerPanel";
import { QueuePanel } from "@/components/QueuePanel";
import { SongSearchPanel } from "@/components/SongSearchPanel";
import { useRoomSession } from "@/hooks/useRoomSession";
import { getAddBlockReason } from "@/lib/queue";
import type { Track } from "@/lib/types";

type RoomViewProps = {
  roomId: string;
};

export function RoomView({ roomId }: RoomViewProps) {
  const {
    session,
    currentUser,
    actor,
    busy,
    actionError,
    addTrack,
    vote,
    removeTrack,
    sendChat,
    sendVoice,
    advanceOnEnded,
    retry,
  } = useRoomSession(roomId);

  const { room, nowPlaying, queue, voteState, messages, status, error } =
    session;

  const addBlockReason = currentUser
    ? getAddBlockReason(nowPlaying, queue, actor)
    : null;
  const roomHasCurrentTrack = nowPlaying !== null;

  const blockedVideoIds = new Set<string>();
  if (nowPlaying) {
    blockedVideoIds.add(nowPlaying.track.id);
    blockedVideoIds.add(nowPlaying.track.youtubeVideoId);
  }
  for (const item of queue) {
    blockedVideoIds.add(item.track.id);
    blockedVideoIds.add(item.track.youtubeVideoId);
  }

  function handleSelectTrack(track: Track) {
    void addTrack(track);
  }

  if (status === "loading" || status === "idle" || !currentUser) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-muted">
        Joining room…
      </div>
    );
  }

  if (status === "error" && !room.id) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <WifiOff className="mx-auto h-8 w-8 text-danger" />
        <p className="mt-4 text-lg font-medium text-foreground">
          Could not join room
        </p>
        <p className="mt-2 text-sm text-muted">
          {error || "Check that the API is running and try again."}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to rooms
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {status === "reconnecting" ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-surface-elevated px-4 py-2 text-sm text-muted">
          <RefreshCw className="h-4 w-4 animate-spin text-accent" />
          Reconnecting… refreshing room state when back online.
        </div>
      ) : null}

      {status === "error" && error ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          <span>{error}</span>
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-1 rounded-full border border-danger/40 px-3 py-1 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      ) : null}

      {actionError ? (
        <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {actionError}
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/"
            className="mb-3 inline-flex items-center gap-2 text-sm text-muted transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            All rooms
          </Link>
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
            {room.name || "Room"}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {room.description}
          </p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-elevated px-4 py-2 text-sm text-muted">
          <Headphones className="h-4 w-4 text-accent" />
          {room.listenerCount} listening
          {busy ? <span className="text-xs text-muted">· syncing</span> : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.9fr)]">
        <div className="space-y-6">
          <section className="relative z-20 overflow-visible rounded-2xl border border-border bg-surface-elevated p-5 sm:p-7">
            <SongSearchPanel
              roomHasCurrentTrack={roomHasCurrentTrack}
              blockedVideoIds={blockedVideoIds}
              addBlockReason={addBlockReason}
              onSelect={handleSelectTrack}
            />

            <div className="mt-8 border-t border-border/80 pt-8">
              <PlayerPanel
                nowPlaying={nowPlaying}
                onEnded={() => void advanceOnEnded()}
              />
              {roomHasCurrentTrack ? (
                <div className="mt-8">
                  <QueuePanel
                    queue={queue}
                    myVoteTrackId={voteState.myVoteTrackId}
                    currentUser={currentUser}
                    actor={actor}
                    embedded
                    onVote={(trackId) => void vote(trackId)}
                    onRemove={(trackId) => void removeTrack(trackId)}
                  />
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <ParticipantList participants={session.participants} />
          <ChatPanel
            messages={messages}
            onSendText={sendChat}
            onSendVoice={sendVoice}
            currentUserName={currentUser.name}
            disabled={status !== "connected"}
            error={null}
          />
        </div>
      </div>
    </div>
  );
}
