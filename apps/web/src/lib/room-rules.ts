/**
 * Tunable room rules — change these numbers to adjust the MVP without hunting through UI code.
 *
 * File: apps/web/src/lib/room-rules.ts
 */
export const ROOM_RULES = {
  /**
   * Max songs one user may have waiting in Up Next at the same time.
   * Add stays available in the UI; this cap is enforced when they try to queue.
   */
  maxQueuedSongsPerUser: 3 as number,

  /**
   * If true, owning Now playing also blocks adding until that song ends
   * (even if you still have queue slots left under maxQueuedSongsPerUser).
   */
  blockAddWhileOwnSongPlaying: false,

  /**
   * Max active votes per user per round.
   * 1 = cast-or-move: voting again moves your single vote (does not stack).
   */
  maxActiveVotesPerUser: 1 as number,
} as const;

export type RoomRules = typeof ROOM_RULES;
