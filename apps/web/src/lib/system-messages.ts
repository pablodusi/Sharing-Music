import type { ChatMessage, LocalUser, Track } from "./types";

export function formatChatTimestamp(date = new Date()): string {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Immutable room event — not editable or deletable by users. */
export function createSystemMessage(content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    author: "system",
    kind: "system",
    content,
    timestamp: formatChatTimestamp(),
  };
}

export function createUserMessage(
  author: string,
  content: string,
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    author,
    kind: "user",
    type: "text",
    content,
    timestamp: formatChatTimestamp(),
  };
}

export function createVoiceMessage(
  author: string,
  audioUrl: string,
  audioDurationMs: number,
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    author,
    kind: "user",
    type: "voice",
    content: "Voice message",
    audioUrl,
    audioDurationMs,
    timestamp: formatChatTimestamp(),
  };
}

export function isSystemMessage(message: ChatMessage): boolean {
  return message.kind === "system" || message.author === "system";
}

export function isVoiceMessage(
  message: ChatMessage,
): message is ChatMessage & { type: "voice"; audioUrl: string } {
  return message.type === "voice" && typeof message.audioUrl === "string";
}

export function songLabel(track: Pick<Track, "title">): string {
  return track.title;
}

export function userLabel(user: Pick<LocalUser, "name">): string {
  return user.name;
}

export function startedPlayingMessage(
  user: Pick<LocalUser, "name">,
  track: Pick<Track, "title">,
): string {
  return `${userLabel(user)} started playing ${songLabel(track)}.`;
}

export function addedToUpNextMessage(
  user: Pick<LocalUser, "name">,
  track: Pick<Track, "title">,
): string {
  return `${userLabel(user)} added ${songLabel(track)} to Up Next.`;
}

export function removedFromUpNextMessage(
  user: Pick<LocalUser, "name">,
  track: Pick<Track, "title">,
): string {
  return `${userLabel(user)} removed ${songLabel(track)} from Up Next.`;
}

export function votedForMessage(
  user: Pick<LocalUser, "name">,
  track: Pick<Track, "title">,
): string {
  return `${userLabel(user)} voted for ${songLabel(track)}.`;
}

export function movedVoteMessage(
  user: Pick<LocalUser, "name">,
  fromTrack: Pick<Track, "title">,
  toTrack: Pick<Track, "title">,
): string {
  return `${userLabel(user)} moved their vote from ${songLabel(fromTrack)} to ${songLabel(toTrack)}.`;
}

export function nowPlayingAutoMessage(
  track: Pick<Track, "title">,
  addedBy: Pick<LocalUser, "name">,
): string {
  return `Now playing: ${songLabel(track)}, added by ${userLabel(addedBy)}.`;
}
