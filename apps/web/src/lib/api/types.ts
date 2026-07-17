/** Shapes returned by the Nest API (Phase 2/3). */

export type ApiUserPublic = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isGuest: boolean;
  guestKey: string | null;
};

export type ApiRoomMember = {
  id: string;
  role: "OWNER" | "MODERATOR" | "LISTENER";
  joinedAt: string;
  user: ApiUserPublic;
};

export type ApiPlayback = {
  youtubeVideoId: string | null;
  trackTitle: string | null;
  trackArtist: string | null;
  trackAlbum: string | null;
  durationMs: number | null;
  positionMs: number;
  isPlaying: boolean;
  updatedAt: string;
  addedBy: ApiUserPublic | null;
} | null;

export type ApiQueueItem = {
  id: string;
  youtubeVideoId: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  addedAt: string;
  addedBy: ApiUserPublic;
  votes: number;
  voteCount: number;
};

export type ApiMessage = {
  id: string;
  type: "TEXT" | "SYSTEM" | "VOICE";
  content: string;
  audioUrl: string | null;
  audioDurationMs: number | null;
  createdAt: string;
  author: ApiUserPublic | null;
};

export type ApiRoomSnapshot = {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  inviteCode: string | null;
  sharePath: string;
  shareUrlPath: string;
  ownerId: string;
  createdAt: string;
  members: ApiRoomMember[];
  /** Live unique connected users — not historical membership size. */
  listenerCount?: number;
  liveUserIds?: string[];
  liveParticipants?: Array<{
    userId: string;
    displayName: string;
    role?: string;
  }>;
  playback: ApiPlayback;
  queue: ApiQueueItem[];
  votesByUser: Record<string, string>;
  messages: ApiMessage[];
};

export type ApiRoomSummary = {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  inviteCode: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  /** Historical RoomMember count (legacy). Prefer listenerCount. */
  memberCount: number;
  /** Live unique sockets currently in the room. */
  listenerCount: number;
  sharePath: string;
  playback: ApiPlayback;
};
