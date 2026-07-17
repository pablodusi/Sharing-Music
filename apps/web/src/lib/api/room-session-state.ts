import { colorForUserId } from "../guest-identity";
import type { ChatMessage, Participant } from "../types";
import {
  appendMessageUnique,
  mapApiMessage,
  mapApiPlayback,
  mapApiQueueItem,
  mapParticipants,
  mapSnapshotToRoomState,
  mergeMessagesById,
  myVoteFromVotes,
  type MappedRoomState,
} from "./snapshot";
import type { ApiMessage, ApiQueueItem, ApiRoomSnapshot } from "./types";

export type ConnectionStatus =
  | "idle"
  | "loading"
  | "connected"
  | "reconnecting"
  | "error";

export type RoomSessionView = MappedRoomState & {
  status: ConnectionStatus;
  error: string | null;
};

export function createEmptySession(): RoomSessionView {
  return {
    status: "idle",
    error: null,
    room: {
      id: "",
      name: "",
      description: "",
      listenerCount: 0,
      isPrivate: false,
      genre: "Live",
      host: "",
      currentTrack: null,
      queue: [],
      participants: [],
      messages: [],
    },
    nowPlaying: null,
    queue: [],
    voteState: { myVoteTrackId: null },
    messages: [],
    participants: [],
    myUserId: null,
    votesByUser: {},
  };
}

export function applyFullSnapshot(
  prev: RoomSessionView,
  snapshot: ApiRoomSnapshot,
  guestKey: string,
  status: ConnectionStatus = "connected",
): RoomSessionView {
  const mapped = mapSnapshotToRoomState(snapshot, guestKey);
  return {
    ...mapped,
    status,
    error: null,
    // Replace messages entirely on snapshot/reconnect — no local duplicates.
    messages: mapped.messages,
    room: {
      ...mapped.room,
      messages: mapped.messages,
      queue: mapped.queue,
      currentTrack: mapped.nowPlaying,
      participants: mapped.participants,
      listenerCount: mapped.room.listenerCount,
    },
  };
}

export function applyQueuePatch(
  prev: RoomSessionView,
  patch: {
    queue?: ApiQueueItem[];
    messages?: ApiMessage[];
    playback?: ApiRoomSnapshot["playback"];
    votesByUser?: Record<string, string>;
  },
): RoomSessionView {
  const queue = patch.queue
    ? patch.queue.map(mapApiQueueItem)
    : prev.queue;
  const nowPlaying =
    patch.playback !== undefined
      ? mapApiPlayback(patch.playback)
      : prev.nowPlaying;
  const votesByUser = patch.votesByUser
    ? { ...patch.votesByUser }
    : prev.votesByUser;
  const voteState = myVoteFromVotes(votesByUser, prev.myUserId);
  const messages = patch.messages
    ? mergeMessagesById(prev.messages, patch.messages.map(mapApiMessage))
    : prev.messages;

  return {
    ...prev,
    queue,
    nowPlaying,
    votesByUser,
    voteState,
    messages,
    room: {
      ...prev.room,
      queue,
      currentTrack: nowPlaying,
      messages,
      listenerCount: prev.participants.length,
    },
  };
}

export function applyVotePatch(
  prev: RoomSessionView,
  patch: {
    queue: ApiQueueItem[];
    votesByUser: Record<string, string>;
    messages?: ApiMessage[];
  },
): RoomSessionView {
  return applyQueuePatch(prev, patch);
}

export function applyChatMessage(
  prev: RoomSessionView,
  message: ApiMessage | ChatMessage,
): RoomSessionView {
  const mapped =
    "type" in message &&
    (message.type === "TEXT" ||
      message.type === "SYSTEM" ||
      message.type === "VOICE")
      ? mapApiMessage(message as ApiMessage)
      : (message as ChatMessage);

  const messages = appendMessageUnique(prev.messages, mapped);
  return {
    ...prev,
    messages,
    room: { ...prev.room, messages },
  };
}

export function applyMemberJoined(
  prev: RoomSessionView,
  payload: {
    member: {
      userId: string;
      displayName: string;
      role: string;
    };
    snapshot?: ApiRoomSnapshot;
  },
  guestKey: string,
): RoomSessionView {
  if (payload.snapshot) {
    return applyFullSnapshot(prev, payload.snapshot, guestKey, prev.status);
  }

  const existing = prev.participants.find((p) => p.id === payload.member.userId);
  if (existing) {
    return prev;
  }

  const participant: Participant = {
    id: payload.member.userId,
    name: payload.member.displayName,
    avatarColor: colorForUserId(payload.member.userId),
    isHost: payload.member.role === "OWNER",
  };
  const participants = [...prev.participants, participant];
  return {
    ...prev,
    participants,
    room: {
      ...prev.room,
      participants,
      listenerCount: participants.length,
    },
  };
}

export function applyMemberLeft(
  prev: RoomSessionView,
  payload: { userId: string; listenerCount?: number },
): RoomSessionView {
  const participants = prev.participants.filter((p) => p.id !== payload.userId);
  const listenerCount =
    typeof payload.listenerCount === "number"
      ? payload.listenerCount
      : participants.length;
  return {
    ...prev,
    participants,
    room: {
      ...prev.room,
      participants,
      listenerCount,
    },
  };
}

export function applyPresenceUpdated(
  prev: RoomSessionView,
  payload: {
    listenerCount: number;
    liveUserIds?: string[];
    liveParticipants?: Array<{
      userId: string;
      displayName: string;
      role?: string;
    }>;
  },
): RoomSessionView {
  let participants = prev.participants;

  if (Array.isArray(payload.liveParticipants)) {
    // Authoritative live roster — rebuild so count and list cannot disagree.
    const previousById = new Map(prev.participants.map((p) => [p.id, p]));
    participants = payload.liveParticipants.map((live) => {
      const existing = previousById.get(live.userId);
      return {
        id: live.userId,
        name: live.displayName || existing?.name || "Guest",
        avatarColor: existing?.avatarColor ?? colorForUserId(live.userId),
        isHost:
          live.role === "OWNER" ||
          existing?.isHost ||
          false,
      };
    });
  } else if (Array.isArray(payload.liveUserIds)) {
    const liveSet = new Set(payload.liveUserIds);
    participants = prev.participants.filter((p) => liveSet.has(p.id));
  }

  const listenerCount =
    typeof payload.listenerCount === "number"
      ? payload.listenerCount
      : participants.length;

  return {
    ...prev,
    participants,
    room: {
      ...prev.room,
      participants,
      listenerCount,
    },
  };
}

export function applyParticipantsFromSnapshot(
  prev: RoomSessionView,
  snapshot: ApiRoomSnapshot,
): RoomSessionView {
  const participants = mapParticipants(snapshot);
  const listenerCount =
    typeof snapshot.listenerCount === "number"
      ? snapshot.listenerCount
      : participants.length;
  return {
    ...prev,
    participants,
    room: {
      ...prev.room,
      participants,
      listenerCount,
    },
  };
}
