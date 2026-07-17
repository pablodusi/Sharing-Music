/**
 * Tunable room rules — mirror of apps/web room-rules for server enforcement.
 */
export const ROOM_RULES = {
  maxQueuedSongsPerUser: 3,
  blockAddWhileOwnSongPlaying: false,
  maxActiveVotesPerUser: 1,
} as const;

export type QueueSortItem = {
  id: string;
  votes: number;
  addedAt: Date | number;
};

/** Votes descending, then oldest addedAt first. */
export function sortQueueByVotesThenAddedAt<T extends QueueSortItem>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    if (b.votes !== a.votes) {
      return b.votes - a.votes;
    }
    const aTime =
      a.addedAt instanceof Date ? a.addedAt.getTime() : Number(a.addedAt);
    const bTime =
      b.addedAt instanceof Date ? b.addedAt.getTime() : Number(b.addedAt);
    return aTime - bTime;
  });
}

export type AddBlockReason =
  | { kind: 'queue_limit'; count: number; max: number }
  | { kind: 'playing'; title: string };

export function getAddBlockReason(input: {
  userId: string;
  queuedByUser: number;
  nowPlayingAddedById: string | null;
  nowPlayingTitle: string | null;
}): AddBlockReason | null {
  if (
    ROOM_RULES.blockAddWhileOwnSongPlaying &&
    input.nowPlayingAddedById === input.userId
  ) {
    return {
      kind: 'playing',
      title: input.nowPlayingTitle ?? 'your song',
    };
  }

  if (input.queuedByUser >= ROOM_RULES.maxQueuedSongsPerUser) {
    return {
      kind: 'queue_limit',
      count: input.queuedByUser,
      max: ROOM_RULES.maxQueuedSongsPerUser,
    };
  }

  return null;
}

export function canRemoveQueueItem(input: {
  addedById: string;
  userId: string;
  voteCount: number;
}): boolean {
  return input.addedById === input.userId && input.voteCount === 0;
}

export function canVoteOnQueueItem(input: {
  addedById: string;
  voterId: string;
}): boolean {
  return input.addedById !== input.voterId;
}
