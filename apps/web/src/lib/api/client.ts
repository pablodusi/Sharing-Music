import { getApiBaseUrl } from "../env";
import type { GuestIdentity } from "../guest-identity";
import type {
  ApiRoomSnapshot,
  ApiRoomSummary,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function guestHeaders(guest: GuestIdentity): HeadersInit {
  return {
    "X-Guest-Id": guest.guestId,
    "X-Guest-Name": guest.displayName,
  };
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError("Invalid JSON from API", response.status, text);
  }
}

async function request<T>(
  path: string,
  guest: GuestIdentity | null,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (guest) {
    const gh = guestHeaders(guest);
    for (const [key, value] of Object.entries(gh)) {
      headers.set(key, value);
    }
  }
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => undefined);
    }
    const message =
      typeof body === "object" &&
      body &&
      "message" in body &&
      (typeof (body as { message: unknown }).message === "string" ||
        Array.isArray((body as { message: unknown }).message))
        ? Array.isArray((body as { message: unknown }).message)
          ? ((body as { message: string[] }).message).join(", ")
          : String((body as { message: string }).message)
        : `API error ${response.status}`;
    throw new ApiError(message, response.status, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return parseJson<T>(response);
}

export function listPublicRooms(): Promise<ApiRoomSummary[]> {
  return request<ApiRoomSummary[]>("/rooms", null, { method: "GET" });
}

export function createRoom(
  guest: GuestIdentity,
  input: { name: string; description?: string; isPrivate?: boolean },
): Promise<ApiRoomSnapshot> {
  return request<ApiRoomSnapshot>("/rooms", guest, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function joinRoom(
  guest: GuestIdentity,
  roomId: string,
): Promise<ApiRoomSnapshot> {
  return request<ApiRoomSnapshot>(`/rooms/${roomId}/join`, guest, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function getRoomSnapshot(
  guest: GuestIdentity,
  roomId: string,
): Promise<ApiRoomSnapshot> {
  return request<ApiRoomSnapshot>(`/rooms/${roomId}`, guest, {
    method: "GET",
  });
}

export function addQueueTrack(
  guest: GuestIdentity,
  roomId: string,
  track: {
    youtubeVideoId: string;
    title: string;
    artist: string;
    album?: string;
    durationMs: number;
  },
): Promise<ApiRoomSnapshot> {
  return request<ApiRoomSnapshot>(`/rooms/${roomId}/queue`, guest, {
    method: "POST",
    body: JSON.stringify(track),
  });
}

export function removeQueueTrack(
  guest: GuestIdentity,
  roomId: string,
  queueItemId: string,
): Promise<ApiRoomSnapshot> {
  return request<ApiRoomSnapshot>(
    `/rooms/${roomId}/queue/${queueItemId}`,
    guest,
    { method: "DELETE" },
  );
}

export function castVote(
  guest: GuestIdentity,
  roomId: string,
  queueItemId: string,
): Promise<ApiRoomSnapshot> {
  return request<ApiRoomSnapshot>(`/rooms/${roomId}/votes`, guest, {
    method: "POST",
    body: JSON.stringify({ queueItemId }),
  });
}

export function sendTextMessage(
  guest: GuestIdentity,
  roomId: string,
  content: string,
): Promise<ApiRoomSnapshot> {
  return request<ApiRoomSnapshot>(`/rooms/${roomId}/messages`, guest, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export function sendVoiceMessage(
  guest: GuestIdentity,
  roomId: string,
  file: Blob,
  durationMs: number,
  filename = "voice.webm",
): Promise<ApiRoomSnapshot> {
  const form = new FormData();
  form.append("file", file, filename);
  form.append("durationMs", String(Math.round(durationMs)));
  return request<ApiRoomSnapshot>(`/rooms/${roomId}/messages/voice`, guest, {
    method: "POST",
    body: form,
  });
}

export function advancePlayback(
  guest: GuestIdentity,
  roomId: string,
  endingYoutubeVideoId?: string,
): Promise<ApiRoomSnapshot> {
  return request<ApiRoomSnapshot>(`/rooms/${roomId}/playback/advance`, guest, {
    method: "POST",
    body: JSON.stringify(
      endingYoutubeVideoId ? { endingYoutubeVideoId } : {},
    ),
  });
}
