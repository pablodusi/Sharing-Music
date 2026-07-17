import { io, type Socket } from "socket.io-client";
import { getSocketUrl } from "../env";
import type { GuestIdentity } from "../guest-identity";
import type { ApiRoomSnapshot } from "./types";

export type RoomSocket = Socket;

export function createRoomSocket(): RoomSocket {
  return io(`${getSocketUrl()}/realtime`, {
    autoConnect: false,
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
}

export function emitWithAck<T>(
  socket: Socket,
  event: string,
  payload: unknown,
  timeoutMs = 12_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Socket timeout: ${event}`));
    }, timeoutMs);

    socket
      .timeout(timeoutMs)
      .emit(event, payload, (err: Error | null, response: T) => {
        clearTimeout(timer);
        if (err) {
          reject(err);
          return;
        }
        resolve(response);
      });
  });
}

export async function socketJoinRoom(
  socket: Socket,
  guest: GuestIdentity,
  roomId: string,
): Promise<{ roomId: string; snapshot: ApiRoomSnapshot }> {
  return emitWithAck(socket, "room.join", {
    roomId,
    guestId: guest.guestId,
    displayName: guest.displayName,
  });
}

export async function socketSyncRoom(
  socket: Socket,
  roomId: string,
): Promise<ApiRoomSnapshot> {
  return emitWithAck(socket, "room.sync", { roomId });
}

export async function socketQueueAdd(
  socket: Socket,
  payload: {
    roomId: string;
    youtubeVideoId: string;
    title: string;
    artist: string;
    album?: string;
    durationMs: number;
  },
): Promise<ApiRoomSnapshot> {
  return emitWithAck(socket, "queue.add", payload);
}

export async function socketQueueRemove(
  socket: Socket,
  roomId: string,
  queueItemId: string,
): Promise<ApiRoomSnapshot> {
  return emitWithAck(socket, "queue.remove", { roomId, queueItemId });
}

export async function socketVoteCast(
  socket: Socket,
  roomId: string,
  queueItemId: string,
): Promise<ApiRoomSnapshot> {
  return emitWithAck(socket, "vote.cast", { roomId, queueItemId });
}

export async function socketChatSend(
  socket: Socket,
  roomId: string,
  content: string,
): Promise<ApiRoomSnapshot> {
  return emitWithAck(socket, "chat.send", { roomId, content });
}

export async function socketPlaybackAdvance(
  socket: Socket,
  roomId: string,
  endingYoutubeVideoId?: string,
): Promise<{ snapshot: ApiRoomSnapshot; advanced: boolean }> {
  return emitWithAck(socket, "playback.advance", {
    roomId,
    endingYoutubeVideoId,
  });
}
