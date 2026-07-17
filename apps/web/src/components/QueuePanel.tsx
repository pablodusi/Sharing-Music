"use client";

import { Check, ChevronUp, Trash2 } from "lucide-react";
import {
  canRemoveQueueItem,
  canVoteOnQueueItem,
  countUserQueuedSongs,
  getLeaderTrackId,
  sortQueueByVotesStable,
} from "@/lib/queue";
import { isOwnedByActor, type StableActorIdentity } from "@/lib/ownership";
import { ROOM_RULES } from "@/lib/room-rules";
import { youtubeThumbnailUrl } from "@/lib/youtube";
import type { LocalUser, QueueItem } from "@/lib/types";

type QueuePanelProps = {
  queue: QueueItem[];
  myVoteTrackId: string | null;
  /** Display identity — must include stable id/guestKey from the session. */
  currentUser: LocalUser;
  /** Ownership / vote actor — User.id and/or persisted guestId only. */
  actor: StableActorIdentity;
  /** Nested inside the listening stage — tighter chrome, less rules copy. */
  embedded?: boolean;
  onVote: (trackId: string) => void;
  onRemove: (trackId: string) => void;
};

export function QueuePanel({
  queue,
  myVoteTrackId,
  currentUser,
  actor,
  embedded = false,
  onVote,
  onRemove,
}: QueuePanelProps) {
  const sorted = sortQueueByVotesStable(queue);
  const leaderId = getLeaderTrackId(queue);
  const totalVotes = queue.reduce((sum, item) => sum + item.votes, 0);
  const myVoteTitle =
    queue.find((item) => item.track.id === myVoteTrackId)?.track.title ?? null;
  const myQueuedCount = countUserQueuedSongs(queue, actor);
  const myQueuedSongs = queue.filter((item) =>
    isOwnedByActor(item.addedBy, actor),
  );
  const maxQueued = ROOM_RULES.maxQueuedSongsPerUser;

  const body = (
    <>
      <div className={embedded ? "mb-4 space-y-2" : "mb-4 space-y-2"}>
        <div>
          <h2
            className={
              embedded
                ? "text-xs font-semibold uppercase tracking-[0.18em] text-muted"
                : "text-sm font-semibold uppercase tracking-wider text-muted"
            }
          >
            Up next
          </h2>
          {!embedded ? (
            <p className="mt-1 text-xs text-muted">
              Sorted by votes (high → low), then oldest added first. One vote
              per person (moves when you vote again). Up to {maxQueued} queued
              song{Number(maxQueued) === 1 ? "" : "s"} per user
              {ROOM_RULES.blockAddWhileOwnSongPlaying
                ? "; cannot add while yours is playing"
                : "; adding allowed while yours is playing"}
              .
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted">
              Votes decide the order · {myQueuedCount}/{maxQueued} of your slots
              used
              {myVoteTitle ? ` · voted for ${myVoteTitle}` : ""}
            </p>
          )}
        </div>

        {!embedded ? (
          <div className="flex items-start gap-3 rounded-xl border border-border bg-black/20 px-3 py-2.5 text-xs">
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2 ring-accent/40"
              style={{ backgroundColor: currentUser.avatarColor }}
              title={currentUser.name}
            >
              {currentUser.initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">
                Acting as <span className="text-accent">{currentUser.name}</span>
              </p>
              {myQueuedCount > 0 ? (
                <p className="mt-0.5 text-muted">
                  Your Up Next: {myQueuedCount}/{maxQueued}
                  {myQueuedSongs.length === 1 ? (
                    <>
                      {" "}
                      —{" "}
                      <span className="font-medium text-foreground">
                        {myQueuedSongs[0].track.title}
                      </span>
                      {myQueuedSongs[0].votes > 0
                        ? " · has votes (locked)"
                        : " · removable"}
                    </>
                  ) : myQueuedSongs.length > 1 ? (
                    <>
                      {" "}
                      —{" "}
                      <span className="font-medium text-foreground">
                        {myQueuedSongs
                          .map((item) => item.track.title)
                          .join(", ")}
                      </span>
                    </>
                  ) : null}
                </p>
              ) : (
                <p className="mt-0.5 text-muted">
                  You have no songs in Up Next — you can add up to {maxQueued}.
                </p>
              )}
              {myVoteTitle ? (
                <p className="mt-0.5 text-muted">
                  Voted for{" "}
                  <span className="font-medium text-foreground">
                    {myVoteTitle}
                  </span>
                </p>
              ) : (
                <p className="mt-0.5 text-muted">No vote this round yet.</p>
              )}
              <p className="mt-1 text-muted">
                {totalVotes === 0
                  ? "No votes yet — when the song ends, the earliest in queue plays."
                  : `${totalVotes} vote${totalVotes === 1 ? "" : "s"} this round.`}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/80 bg-black/10 px-4 py-6 text-center text-sm text-muted">
          Queue is empty — add a song to keep the room going.
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((item, index) => {
            const isMyVote = myVoteTrackId === item.track.id;
            const isMine = isOwnedByActor(item.addedBy, actor);
            const canRemove = canRemoveQueueItem(item, actor);
            const canVote = canVoteOnQueueItem(item, actor);
            const isLeader = leaderId === item.track.id;
            const leadingByVotes = totalVotes > 0 && isLeader;

            return (
              <li
                key={item.track.id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors ${
                  leadingByVotes
                    ? "border-accent/50 bg-accent/10"
                    : isMine
                      ? "border-accent/30 bg-accent/5"
                      : "border-border bg-black/15"
                }`}
              >
                <span className="w-5 shrink-0 text-center text-xs font-medium text-muted">
                  {index + 1}
                </span>

                <div className="relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={youtubeThumbnailUrl(item.track.youtubeVideoId)}
                    alt=""
                    className="h-10 w-10 rounded-md object-cover"
                  />
                  <span
                    className="absolute -bottom-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-2 ring-surface-elevated"
                    style={{ backgroundColor: item.addedBy.avatarColor }}
                    title={`Added by ${item.addedBy.name}`}
                  >
                    {item.addedBy.initial}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.track.title}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {item.track.artist}
                    {leadingByVotes ? " · leader" : ""}
                    {!leadingByVotes && totalVotes === 0 && index === 0
                      ? " · default next"
                      : ""}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11px] uppercase tracking-wide text-muted">
                    {item.votes} {item.votes === 1 ? "vote" : "votes"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {isMine ? (
                      <button
                        type="button"
                        disabled={!canRemove}
                        onClick={() => onRemove(item.track.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-black/20 px-2.5 py-1.5 text-xs font-medium text-muted transition hover:border-danger/50 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={
                          canRemove
                            ? `Remove ${item.track.title}`
                            : "Cannot remove — someone already voted"
                        }
                        title={
                          canRemove
                            ? "Remove your song"
                            : "Someone voted — you cannot remove this song"
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    ) : null}
                    {canVote ? (
                      <button
                        type="button"
                        onClick={() => onVote(item.track.id)}
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          isMyVote
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-border bg-black/20 text-foreground hover:border-accent/50 hover:text-accent"
                        }`}
                        aria-label={
                          isMyVote
                            ? `Your current vote: ${item.track.title}`
                            : `Vote for ${item.track.title}`
                        }
                      >
                        {isMyVote ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronUp className="h-3.5 w-3.5" />
                        )}
                        {isMyVote ? "Voted" : "Vote"}
                      </button>
                    ) : (
                      <span className="rounded-full border border-border px-3 py-1.5 text-xs text-muted">
                        Yours
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="border-t border-border/80 pt-6">
        {body}
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface-elevated p-5">
      {body}
    </section>
  );
}
