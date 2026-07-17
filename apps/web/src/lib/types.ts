export type Participant = {
  id: string;
  name: string;
  avatarColor: string;
  isHost?: boolean;
};

export type ChatMessage = {
  id: string;
  author: string;
  content: string;
  timestamp: string;
  /** System messages are room events — not editable or deletable. */
  kind?: "user" | "system";
  /** Default text; voice uses a local object URL for MVP. */
  type?: "text" | "voice";
  /** blob: object URL for local voice messages. */
  audioUrl?: string;
  /** Recorded duration in milliseconds. */
  audioDurationMs?: number;
};

/** A song played via the official YouTube iframe embed (no MP3 downloads). */
export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  /** Approximate length for UI until the player reports the real duration. */
  durationMs: number;
  /** YouTube video id used by the IFrame Player API. */
  youtubeVideoId: string;
  coverColor?: string;
};

/**
 * A track waiting in the room queue.
 * Sort: votes desc, then `addedAt` asc (earlier first). `joinedOrder` is a legacy tie-break.
 * `addedBy` is who queued it — only that user may remove it (if unvoted).
 */
export type QueueItem = {
  track: Track;
  votes: number;
  /** Epoch ms when the song was added — secondary sort after votes. */
  addedAt: number;
  /** Legacy / fallback order when `addedAt` is missing. */
  joinedOrder: number;
  addedBy: LocalUser;
};

/** Currently playing song, including who started / owned it. */
export type NowPlaying = {
  track: Track;
  addedBy: LocalUser;
  /** Server clock anchor — used only for local seek sync. */
  positionMs: number;
  isPlaying: boolean;
  updatedAt: string;
};

export type Room = {
  id: string;
  name: string;
  description: string;
  listenerCount: number;
  isPrivate: boolean;
  genre: string;
  host: string;
  currentTrack: NowPlaying | null;
  queue: QueueItem[];
  participants: Participant[];
  messages: ChatMessage[];
};

export type CreateRoomInput = {
  name: string;
  description?: string;
  isPrivate?: boolean;
  genre?: string;
};

/** Local voting state: one vote per user per room per round. */
export type RoundVoteState = {
  /** Track id this browser voted for, or null if not voted yet. */
  myVoteTrackId: string | null;
};

/** Simulated local user for the MVP (no auth). */
export type LocalUser = {
  /** Server User.id when known; otherwise a display-only fallback — not for ownership alone. */
  id: string;
  name: string;
  avatarColor: string;
  initial: string;
  /** Persisted guest key when this user is a guest. */
  guestKey?: string | null;
};
