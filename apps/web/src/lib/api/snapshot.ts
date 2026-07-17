import { resolveMediaUrl } from "../env";
import { colorForUserId } from "../guest-identity";
import type {
  ChatMessage,
  LocalUser,
  NowPlaying,
  Participant,
  QueueItem,
  Room,
  RoundVoteState,
} from "../types";
import type {
  ApiMessage,
  ApiQueueItem,
  ApiRoomSnapshot,
  ApiRoomSummary,
  ApiUserPublic,
} from "./types";

export function mapApiUser(user: ApiUserPublic): LocalUser {
  const name = user.displayName || user.username || "Guest";
  return {
    id: user.id,
    name,
    avatarColor: colorForUserId(user.id),
    initial: name.slice(0, 1).toUpperCase() || "G",
    guestKey: user.guestKey ?? null,
  };
}

export function mapApiQueueItem(item: ApiQueueItem, index: number): QueueItem {
  const addedAt = Date.parse(item.addedAt);
  return {
    track: {
      // Use queue item id so vote/remove map 1:1 to API queueItemId.
      id: item.id,
      title: item.title,
      artist: item.artist,
      album: item.album || "YouTube",
      durationMs: item.durationMs,
      youtubeVideoId: item.youtubeVideoId,
    },
    votes: item.votes ?? item.voteCount ?? 0,
    addedAt: Number.isFinite(addedAt) ? addedAt : Date.now() + index,
    joinedOrder: index,
    addedBy: mapApiUser(item.addedBy),
  };
}

export function mapApiPlayback(
  playback: ApiRoomSnapshot["playback"],
): NowPlaying | null {
  if (!playback?.youtubeVideoId) {
    return null;
  }
  return {
    track: {
      id: `yt-${playback.youtubeVideoId}`,
      title: playback.trackTitle || "Unknown track",
      artist: playback.trackArtist || "Unknown",
      album: playback.trackAlbum || "YouTube",
      durationMs: playback.durationMs ?? 0,
      youtubeVideoId: playback.youtubeVideoId,
    },
    addedBy: playback.addedBy
      ? mapApiUser(playback.addedBy)
      : {
          id: "unknown",
          name: "someone",
          avatarColor: "#64748b",
          initial: "?",
        },
    positionMs: playback.positionMs ?? 0,
    isPlaying: playback.isPlaying ?? false,
    updatedAt: playback.updatedAt,
  };
}

export function mapApiMessage(message: ApiMessage): ChatMessage {
  const created = new Date(message.createdAt);
  const timestamp = Number.isNaN(created.getTime())
    ? ""
    : created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (message.type === "SYSTEM") {
    return {
      id: message.id,
      author: "system",
      kind: "system",
      content: message.content,
      timestamp,
    };
  }

  const author = message.author
    ? message.author.displayName || message.author.username
    : "Guest";

  if (message.type === "VOICE") {
    return {
      id: message.id,
      author,
      kind: "user",
      type: "voice",
      content: message.content || "Voice message",
      audioUrl: resolveMediaUrl(message.audioUrl),
      audioDurationMs: message.audioDurationMs ?? undefined,
      timestamp,
    };
  }

  return {
    id: message.id,
    author,
    kind: "user",
    type: "text",
    content: message.content,
    timestamp,
  };
}

/** Merge by id — later list wins on conflict; preserves order of `incoming`. */
export function mergeMessagesById(
  existing: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const message of existing) {
    byId.set(message.id, message);
  }
  for (const message of incoming) {
    byId.set(message.id, message);
  }

  const seen = new Set<string>();
  const merged: ChatMessage[] = [];

  for (const message of [...existing, ...incoming]) {
    if (seen.has(message.id)) {
      continue;
    }
    seen.add(message.id);
    const latest = byId.get(message.id);
    if (latest) {
      merged.push(latest);
    }
  }

  return merged;
}

export function appendMessageUnique(
  messages: ChatMessage[],
  message: ChatMessage,
): ChatMessage[] {
  if (messages.some((item) => item.id === message.id)) {
    return messages;
  }
  return [...messages, message];
}

export function mapParticipants(snapshot: ApiRoomSnapshot): Participant[] {
  if (Array.isArray(snapshot.liveParticipants)) {
    const memberById = new Map(
      snapshot.members.map((member) => [member.user.id, member]),
    );
    return snapshot.liveParticipants.map((live) => {
      const member = memberById.get(live.userId);
      return {
        id: live.userId,
        name:
          live.displayName ||
          member?.user.displayName ||
          member?.user.username ||
          "Guest",
        avatarColor: colorForUserId(live.userId),
        isHost: live.role === "OWNER" || member?.role === "OWNER",
      };
    });
  }

  const liveIds = snapshot.liveUserIds;
  const members = Array.isArray(liveIds)
    ? snapshot.members.filter((member) => liveIds.includes(member.user.id))
    : snapshot.members;

  return members.map((member) => ({
    id: member.user.id,
    name: member.user.displayName || member.user.username,
    avatarColor: colorForUserId(member.user.id),
    isHost: member.role === "OWNER",
  }));
}

export function myVoteFromVotes(
  votesByUser: Record<string, string>,
  myUserId: string | null,
): RoundVoteState {
  if (!myUserId) {
    return { myVoteTrackId: null };
  }
  return {
    myVoteTrackId: votesByUser[myUserId] ?? null,
  };
}

export function myVoteFromSnapshot(
  snapshot: ApiRoomSnapshot,
  myUserId: string | null,
): RoundVoteState {
  return myVoteFromVotes(snapshot.votesByUser, myUserId);
}

export function resolveMyUserId(
  snapshot: ApiRoomSnapshot,
  guestKey: string,
): string | null {
  // Require a real guest key — never match null/undefined guestKeys (that
  // would incorrectly resolve to the first member, usually the room owner).
  if (typeof guestKey !== "string" || guestKey.length < 8) {
    return null;
  }
  const member = snapshot.members.find(
    (item) =>
      typeof item.user.guestKey === "string" &&
      item.user.guestKey.length >= 8 &&
      item.user.guestKey === guestKey,
  );
  return member?.user.id ?? null;
}

export type MappedRoomState = {
  room: Room;
  nowPlaying: NowPlaying | null;
  queue: QueueItem[];
  voteState: RoundVoteState;
  messages: ChatMessage[];
  participants: Participant[];
  myUserId: string | null;
  votesByUser: Record<string, string>;
};

export function mapSnapshotToRoomState(
  snapshot: ApiRoomSnapshot,
  guestKey: string,
): MappedRoomState {
  const myUserId = resolveMyUserId(snapshot, guestKey);
  const owner = snapshot.members.find((m) => m.role === "OWNER")?.user;
  const queue = snapshot.queue.map(mapApiQueueItem);
  const messages = snapshot.messages.map(mapApiMessage);
  const participants = mapParticipants(snapshot);
  const nowPlaying = mapApiPlayback(snapshot.playback);
  const listenerCount =
    typeof snapshot.listenerCount === "number"
      ? snapshot.listenerCount
      : participants.length;

  const room: Room = {
    id: snapshot.id,
    name: snapshot.name,
    description: snapshot.description || "",
    listenerCount,
    isPrivate: snapshot.isPrivate,
    genre: "Live",
    host: owner?.displayName || owner?.username || "Host",
    currentTrack: nowPlaying,
    queue,
    participants,
    messages,
  };

  return {
    room,
    nowPlaying,
    queue,
    voteState: myVoteFromSnapshot(snapshot, myUserId),
    messages,
    participants,
    myUserId,
    votesByUser: { ...snapshot.votesByUser },
  };
}

export function mapSummaryToRoom(summary: ApiRoomSummary): Room {
  return {
    id: summary.id,
    name: summary.name,
    description: summary.description || "",
    listenerCount:
      typeof summary.listenerCount === "number"
        ? summary.listenerCount
        : summary.memberCount,
    isPrivate: summary.isPrivate,
    genre: "Live",
    host: "Host",
    currentTrack: mapApiPlayback(summary.playback),
    queue: [],
    participants: [],
    messages: [],
  };
}
