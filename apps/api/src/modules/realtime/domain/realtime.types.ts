export interface PlaybackState {
  youtubeVideoId: string | null;
  trackTitle: string | null;
  trackArtist: string | null;
  trackAlbum: string | null;
  durationMs: number | null;
  positionMs: number;
  isPlaying: boolean;
  updatedAt: string;
}

export type RoomRealtimeEventType =
  | 'room.joined'
  | 'room.snapshot'
  | 'member.joined'
  | 'member.left'
  | 'presence.updated'
  | 'queue.updated'
  | 'vote.updated'
  | 'chat.message'
  | 'playback.updated'
  | 'playback.advanced';

export interface RoomRealtimeEvent {
  type: RoomRealtimeEventType;
  roomId: string;
  payload: unknown;
  emittedAt: string;
}

export interface UpdatePlaybackCommand {
  youtubeVideoId?: string | null;
  trackTitle?: string | null;
  trackArtist?: string | null;
  trackAlbum?: string | null;
  durationMs?: number | null;
  positionMs?: number;
  isPlaying?: boolean;
}
