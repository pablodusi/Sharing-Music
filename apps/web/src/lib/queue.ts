import { ROOM_RULES } from "./room-rules";
import {
  isOwnedByActor,
  toStableActor,
  type StableActorIdentity,
} from "./ownership";
import type {
  LocalUser,
  NowPlaying,
  QueueItem,
  RoundVoteState,
  Track,
} from "./types";

type ActorInput = StableActorIdentity | string;

/**
 * Cast or move the single local vote for this round.
 * Enforced by ROOM_RULES.maxActiveVotesPerUser (1 → move-your-vote).
 * Users cannot vote on songs they added themselves.
 */
export function castOrMoveVote(
  queue: QueueItem[],
  voteState: RoundVoteState,
  trackId: string,
  voter: ActorInput,
): { queue: QueueItem[]; voteState: RoundVoteState } {
  const target = queue.find((item) => item.track.id === trackId);
  const actor = toStableActor(voter);

  if (!target) {
    return { queue, voteState };
  }

  if (isOwnedByActor(target.addedBy, actor)) {
    return { queue, voteState };
  }

  if (voteState.myVoteTrackId === trackId) {
    return { queue, voteState };
  }

  const nextQueue = queue.map((item) => {
    let votes = item.votes;

    // One active vote: peel the previous vote off before applying the new one.
    if (
      ROOM_RULES.maxActiveVotesPerUser === 1 &&
      voteState.myVoteTrackId &&
      item.track.id === voteState.myVoteTrackId
    ) {
      votes = Math.max(0, votes - 1);
    }

    if (item.track.id === trackId) {
      votes += 1;
    }

    return { ...item, votes };
  });

  return {
    queue: nextQueue,
    voteState: { myVoteTrackId: trackId },
  };
}

/**
 * Pick the next song when the current video ends:
 * - most votes wins
 * - ties: earlier addedAt / joinedOrder wins
 * Finished song is NOT recycled — it leaves the room entirely.
 * Votes reset for a new round.
 */
export function advanceToVotedTrack(
  _current: NowPlaying | null,
  queue: QueueItem[],
): {
  currentTrack: NowPlaying | null;
  queue: QueueItem[];
  voteState: RoundVoteState;
} {
  if (queue.length === 0) {
    return {
      currentTrack: null,
      queue,
      voteState: { myVoteTrackId: null },
    };
  }

  const ranked = sortQueueByVotesStable(queue);
  const winner = ranked[0];
  const remaining = queue
    .filter((item) => item.track.id !== winner.track.id)
    .map((item, index) => ({
      ...item,
      votes: 0,
      joinedOrder: index,
    }));

  return {
    currentTrack: {
      track: winner.track,
      addedBy: winner.addedBy,
      positionMs: 0,
      isPlaying: true,
      updatedAt: new Date().toISOString(),
    },
    queue: remaining,
    voteState: { myVoteTrackId: null },
  };
}

/**
 * Sort by vote count descending, then by time added ascending (oldest first).
 */
export function sortQueueByVotesStable(queue: QueueItem[]): QueueItem[] {
  return [...queue].sort((a, b) => {
    if (b.votes !== a.votes) {
      return b.votes - a.votes;
    }
    const aTime = a.addedAt ?? a.joinedOrder;
    const bTime = b.addedAt ?? b.joinedOrder;
    if (aTime !== bTime) {
      return aTime - bTime;
    }
    return a.joinedOrder - b.joinedOrder;
  });
}

export function getLeaderTrackId(queue: QueueItem[]): string | null {
  if (queue.length === 0) {
    return null;
  }

  return sortQueueByVotesStable(queue)[0]?.track.id ?? null;
}

export function countUserQueuedSongs(
  queue: QueueItem[],
  actor: ActorInput,
): number {
  const identity = toStableActor(actor);
  return queue.filter((item) => isOwnedByActor(item.addedBy, identity)).length;
}

/** Songs this user currently has waiting in Up Next. */
export function findUserQueuedSongs(
  queue: QueueItem[],
  actor: ActorInput,
): QueueItem[] {
  const identity = toStableActor(actor);
  return queue.filter((item) => isOwnedByActor(item.addedBy, identity));
}

/** @deprecated Prefer findUserQueuedSongs / countUserQueuedSongs */
export function findUserQueuedSong(
  queue: QueueItem[],
  actor: ActorInput,
): QueueItem | undefined {
  return findUserQueuedSongs(queue, actor)[0];
}

export type AddBlockReason =
  | {
      kind: "queue_limit";
      count: number;
      max: number;
    }
  | {
      kind: "playing";
      title: string;
    };

/**
 * Why this user cannot add another song right now, or null if they can.
 * Driven by ROOM_RULES.maxQueuedSongsPerUser and blockAddWhileOwnSongPlaying.
 */
export function getAddBlockReason(
  nowPlaying: NowPlaying | null,
  queue: QueueItem[],
  actor: ActorInput,
): AddBlockReason | null {
  const identity = toStableActor(actor);

  if (
    ROOM_RULES.blockAddWhileOwnSongPlaying &&
    nowPlaying &&
    isOwnedByActor(nowPlaying.addedBy, identity)
  ) {
    return { kind: "playing", title: nowPlaying.track.title };
  }

  const count = countUserQueuedSongs(queue, identity);
  if (count >= ROOM_RULES.maxQueuedSongsPerUser) {
    return {
      kind: "queue_limit",
      count,
      max: ROOM_RULES.maxQueuedSongsPerUser,
    };
  }

  return null;
}

/** Human-readable message for the add-limit banner / feedback. */
export function formatAddBlockMessage(reason: AddBlockReason): string {
  if (reason.kind === "playing") {
    return `Your song “${reason.title}” is playing. Wait until it finishes before adding another.`;
  }

  const songWord = reason.max === 1 ? "song" : "songs";
  if (reason.max === 1) {
    return `You've hit the limit of ${reason.max} ${songWord} in Up Next. Remove it to add another.`;
  }

  return `You've hit the limit of ${reason.max} ${songWord} in Up Next (${reason.count}/${reason.max}). Remove one to add another.`;
}

/** @deprecated Prefer getAddBlockReason */
export type ActiveSongSlot =
  | { kind: "playing"; title: string }
  | { kind: "queued"; title: string };

/** @deprecated Prefer getAddBlockReason */
export function findUserActiveSong(
  nowPlaying: NowPlaying | null,
  queue: QueueItem[],
  actor: ActorInput,
): ActiveSongSlot | null {
  const reason = getAddBlockReason(nowPlaying, queue, actor);
  if (!reason) {
    return null;
  }
  if (reason.kind === "playing") {
    return { kind: "playing", title: reason.title };
  }
  const first = findUserQueuedSong(queue, actor);
  return first
    ? { kind: "queued", title: first.track.title }
    : { kind: "queued", title: "your song" };
}

export type AddTrackResult =
  | { queue: QueueItem[]; added: true }
  | {
      queue: QueueItem[];
      added: false;
      reason: "duplicate" | "queue_limit" | "already_playing";
    };

/**
 * Append a track owned by `addedBy`.
 * Enforces ROOM_RULES.maxQueuedSongsPerUser (and optional playing block).
 */
export function addTrackToQueue(
  queue: QueueItem[],
  track: Track,
  addedBy: LocalUser,
  nowPlaying: NowPlaying | null = null,
): AddTrackResult {
  const actor: StableActorIdentity = {
    userId: addedBy.id,
    guestId: addedBy.guestKey ?? null,
  };
  const block = getAddBlockReason(nowPlaying, queue, actor);
  if (block?.kind === "playing") {
    return { queue, added: false, reason: "already_playing" };
  }
  if (block?.kind === "queue_limit") {
    return { queue, added: false, reason: "queue_limit" };
  }

  if (
    queue.some((item) => item.track.id === track.id) ||
    queue.some((item) => item.track.youtubeVideoId === track.youtubeVideoId)
  ) {
    return { queue, added: false, reason: "duplicate" };
  }

  if (
    nowPlaying &&
    (nowPlaying.track.id === track.id ||
      nowPlaying.track.youtubeVideoId === track.youtubeVideoId)
  ) {
    return { queue, added: false, reason: "duplicate" };
  }

  const nextOrder =
    queue.length === 0
      ? 0
      : Math.max(...queue.map((item) => item.joinedOrder)) + 1;

  const now = Date.now();

  return {
    queue: [
      ...queue,
      {
        track,
        votes: 0,
        addedAt: now,
        joinedOrder: nextOrder,
        addedBy,
      },
    ],
    added: true,
  };
}

/**
 * Remove a song from Up Next.
 * Allowed only if you own it and nobody has voted on it yet (votes === 0).
 */
export function removeOwnTrackFromQueue(
  queue: QueueItem[],
  trackId: string,
  actor: ActorInput,
  voteState: RoundVoteState,
): { queue: QueueItem[]; voteState: RoundVoteState; removed: boolean } {
  const target = queue.find((item) => item.track.id === trackId);

  if (!target || !canRemoveQueueItem(target, actor)) {
    return { queue, voteState, removed: false };
  }

  const nextQueue = queue
    .filter((item) => item.track.id !== trackId)
    .map((item, index) => ({ ...item, joinedOrder: index }));

  const nextVote =
    voteState.myVoteTrackId === trackId
      ? { myVoteTrackId: null }
      : voteState;

  return {
    queue: nextQueue,
    voteState: nextVote,
    removed: true,
  };
}

/** Owner only, and only while the song still has zero votes. */
export function canRemoveQueueItem(
  item: QueueItem,
  actor: ActorInput,
): boolean {
  return isOwnedByActor(item.addedBy, toStableActor(actor)) && item.votes === 0;
}

/** Users cannot vote on songs they queued themselves. */
export function canVoteOnQueueItem(
  item: QueueItem,
  actor: ActorInput,
): boolean {
  return !isOwnedByActor(item.addedBy, toStableActor(actor));
}

/** Normalize legacy rooms that stored a bare Track as currentTrack. */
export function normalizeNowPlaying(value: unknown): NowPlaying | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<NowPlaying> & Partial<Track>;

  if ("track" in record && record.track && record.addedBy) {
    return {
      track: record.track,
      addedBy: record.addedBy,
      positionMs: record.positionMs ?? 0,
      isPlaying: record.isPlaying ?? false,
      updatedAt: record.updatedAt ?? new Date(0).toISOString(),
    };
  }

  if ("youtubeVideoId" in record && typeof record.youtubeVideoId === "string") {
    return {
      track: record as Track,
      addedBy: {
        id: "unknown-owner",
        name: "someone",
        avatarColor: "#64748b",
        initial: "?",
        guestKey: null,
      },
      positionMs: 0,
      isPlaying: false,
      updatedAt: new Date(0).toISOString(),
    };
  }

  return null;
}
