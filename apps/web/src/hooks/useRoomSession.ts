"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "@/lib/api/client";
import {
  applyChatMessage,
  applyFullSnapshot,
  applyMemberJoined,
  applyMemberLeft,
  applyPresenceUpdated,
  applyQueuePatch,
  applyVotePatch,
  createEmptySession,
  type RoomSessionView,
} from "@/lib/api/room-session-state";
import {
  createRoomSocket,
  socketChatSend,
  socketJoinRoom,
  socketPlaybackAdvance,
  socketQueueAdd,
  socketQueueRemove,
  socketSyncRoom,
  socketVoteCast,
  type RoomSocket,
} from "@/lib/api/room-socket";
import type { ApiMessage, ApiRoomSnapshot } from "@/lib/api/types";
import {
  ensureGuestIdentity,
  guestToLocalUser,
  type GuestIdentity,
} from "@/lib/guest-identity";
import { formatAddBlockMessage, getAddBlockReason } from "@/lib/queue";
import type { LocalUser, Track } from "@/lib/types";

export function useRoomSession(roomId: string) {
  const [session, setSession] = useState<RoomSessionView>(createEmptySession);
  const [guest, setGuest] = useState<GuestIdentity | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const socketRef = useRef<RoomSocket | null>(null);
  const guestKeyRef = useRef<string>("");
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;
  const endingGuardRef = useRef<string | null>(null);

  const currentUser: LocalUser | null = guest
    ? guestToLocalUser(guest, session.myUserId)
    : null;

  /** Stable actor for ownership — never display name or placeholder "me". */
  const actor = {
    userId: session.myUserId,
    guestId: guest?.guestId ?? null,
  };

  const replaceFromSnapshot = useCallback(
    (snapshot: ApiRoomSnapshot, status: RoomSessionView["status"] = "connected") => {
      const key = guestKeyRef.current;
      setSession((prev) => applyFullSnapshot(prev, snapshot, key, status));
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const identity = ensureGuestIdentity();
    // Restore only from localStorage — never copy another member from the snapshot.
    setGuest(identity);
    guestKeyRef.current = identity.guestId;

    const socket = createRoomSocket();
    socketRef.current = socket;

    async function boot() {
      setSession((prev) => ({
        ...prev,
        status: "loading",
        error: null,
      }));

      try {
        const snapshot = await api.joinRoom(identity, roomId);
        if (cancelled) {
          return;
        }
        replaceFromSnapshot(snapshot, "loading");

        let joinedOnce = false;

        async function joinAndSync(mode: "initial" | "reconnect") {
          if (cancelled) {
            return;
          }
          if (mode === "reconnect") {
            setSession((prev) => ({ ...prev, status: "reconnecting" }));
          }
          try {
            const joined = await socketJoinRoom(socket, identity, roomId);
            if (mode === "reconnect") {
              const snapshot = await socketSyncRoom(socket, roomId);
              if (!cancelled) {
                replaceFromSnapshot(snapshot, "connected");
              }
              return;
            }
            if (!cancelled) {
              replaceFromSnapshot(joined.snapshot, "connected");
            }
          } catch (error) {
            if (!cancelled) {
              setSession((prev) => ({
                ...prev,
                status: "error",
                error:
                  error instanceof Error
                    ? error.message
                    : mode === "reconnect"
                      ? "Reconnect sync failed"
                      : "Failed to join realtime room",
              }));
            }
          }
        }

        function onConnect() {
          if (cancelled) {
            return;
          }
          const mode = joinedOnce ? "reconnect" : "initial";
          joinedOnce = true;
          void joinAndSync(mode);
        }

        function onDisconnect() {
          if (cancelled) {
            return;
          }
          setSession((prev) =>
            prev.status === "error"
              ? prev
              : { ...prev, status: "reconnecting" },
          );
        }

        function onRoomSnapshot(snapshot: ApiRoomSnapshot) {
          if (!cancelled) {
            replaceFromSnapshot(snapshot, "connected");
          }
        }

        function onMemberJoined(payload: {
          member: {
            userId: string;
            displayName: string;
            role: string;
          };
          snapshot?: ApiRoomSnapshot;
        }) {
          if (cancelled) {
            return;
          }
          setSession((prev) =>
            applyMemberJoined(prev, payload, guestKeyRef.current),
          );
        }

        function onMemberLeft(payload: {
          userId: string;
          displayName?: string;
          listenerCount?: number;
        }) {
          if (!cancelled) {
            setSession((prev) => applyMemberLeft(prev, payload));
          }
        }

        function onPresenceUpdated(payload: {
          listenerCount: number;
          liveUserIds?: string[];
          liveParticipants?: Array<{
            userId: string;
            displayName: string;
            role?: string;
          }>;
        }) {
          if (!cancelled) {
            setSession((prev) => applyPresenceUpdated(prev, payload));
          }
        }

        function onQueueUpdated(payload: {
          queue: ApiRoomSnapshot["queue"];
          messages?: ApiRoomSnapshot["messages"];
          playback?: ApiRoomSnapshot["playback"];
        }) {
          if (!cancelled) {
            setSession((prev) => applyQueuePatch(prev, payload));
          }
        }

        function onVoteUpdated(payload: {
          queue: ApiRoomSnapshot["queue"];
          votesByUser: Record<string, string>;
          messages?: ApiRoomSnapshot["messages"];
        }) {
          if (!cancelled) {
            setSession((prev) => applyVotePatch(prev, payload));
          }
        }

        function onChatMessage(message: ApiMessage) {
          if (!cancelled) {
            setSession((prev) => applyChatMessage(prev, message));
          }
        }

        function onPlaybackUpdated(payload: {
          playback: ApiRoomSnapshot["playback"];
        }) {
          if (!cancelled) {
            setSession((prev) =>
              applyQueuePatch(prev, { playback: payload.playback }),
            );
          }
        }

        function onPlaybackAdvanced(payload: {
          playback: ApiRoomSnapshot["playback"];
          queue: ApiRoomSnapshot["queue"];
          votesByUser: Record<string, string>;
          messages?: ApiRoomSnapshot["messages"];
        }) {
          if (!cancelled) {
            endingGuardRef.current = null;
            setSession((prev) =>
              applyQueuePatch(prev, {
                playback: payload.playback,
                queue: payload.queue,
                votesByUser: payload.votesByUser,
                messages: payload.messages,
              }),
            );
          }
        }

        // off→on prevents duplicate handlers if this effect ever re-binds
        // without a full socket recreate (e.g. Fast Refresh).
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
        socket.off("room.snapshot", onRoomSnapshot);
        socket.off("member.joined", onMemberJoined);
        socket.off("member.left", onMemberLeft);
        socket.off("presence.updated", onPresenceUpdated);
        socket.off("queue.updated", onQueueUpdated);
        socket.off("vote.updated", onVoteUpdated);
        socket.off("chat.message", onChatMessage);
        socket.off("playback.updated", onPlaybackUpdated);
        socket.off("playback.advanced", onPlaybackAdvanced);

        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);
        socket.on("room.snapshot", onRoomSnapshot);
        socket.on("member.joined", onMemberJoined);
        socket.on("member.left", onMemberLeft);
        socket.on("presence.updated", onPresenceUpdated);
        socket.on("queue.updated", onQueueUpdated);
        socket.on("vote.updated", onVoteUpdated);
        socket.on("chat.message", onChatMessage);
        socket.on("playback.updated", onPlaybackUpdated);
        socket.on("playback.advanced", onPlaybackAdvanced);

        socket.connect();
      } catch (error) {
        if (!cancelled) {
          setSession((prev) => ({
            ...prev,
            status: "error",
            error:
              error instanceof Error ? error.message : "Failed to load room",
          }));
        }
      }
    }

    void boot();

    return () => {
      cancelled = true;
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, replaceFromSnapshot]);

  const runAction = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Action failed",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const addTrack = useCallback(
    async (track: Track) => {
      const socket = socketRef.current;
      if (!socket?.connected || !guest) {
        return;
      }
      const block = getAddBlockReason(
        session.nowPlaying,
        session.queue,
        {
          userId: session.myUserId,
          guestId: guest.guestId,
        },
      );
      if (block) {
        setActionError(formatAddBlockMessage(block));
        return;
      }
      await runAction(async () => {
        const snapshot = await socketQueueAdd(socket, {
          roomId,
          youtubeVideoId: track.youtubeVideoId,
          title: track.title,
          artist: track.artist,
          album: track.album,
          durationMs: track.durationMs,
        });
        replaceFromSnapshot(snapshot);
      });
    },
    [
      guest,
      replaceFromSnapshot,
      roomId,
      runAction,
      session.myUserId,
      session.nowPlaying,
      session.queue,
    ],
  );

  const vote = useCallback(
    async (queueItemId: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        return;
      }
      await runAction(async () => {
        const snapshot = await socketVoteCast(socket, roomId, queueItemId);
        replaceFromSnapshot(snapshot);
      });
    },
    [replaceFromSnapshot, roomId, runAction],
  );

  const removeTrack = useCallback(
    async (queueItemId: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        return;
      }
      await runAction(async () => {
        const snapshot = await socketQueueRemove(socket, roomId, queueItemId);
        replaceFromSnapshot(snapshot);
      });
    },
    [replaceFromSnapshot, roomId, runAction],
  );

  const sendChat = useCallback(
    async (content: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        return;
      }
      await runAction(async () => {
        const snapshot = await socketChatSend(socket, roomId, content);
        replaceFromSnapshot(snapshot);
      });
    },
    [replaceFromSnapshot, roomId, runAction],
  );

  const sendVoice = useCallback(
    async (blob: Blob, durationMs: number) => {
      if (!guest) {
        return;
      }
      await runAction(async () => {
        const snapshot = await api.sendVoiceMessage(
          guest,
          roomId,
          blob,
          durationMs,
        );
        replaceFromSnapshot(snapshot);
      });
    },
    [guest, replaceFromSnapshot, roomId, runAction],
  );

  const advanceOnEnded = useCallback(async () => {
    const socket = socketRef.current;
    const videoId = session.nowPlaying?.track.youtubeVideoId;
    if (!socket?.connected || !videoId) {
      return;
    }
    if (endingGuardRef.current === videoId) {
      return;
    }
    endingGuardRef.current = videoId;
    try {
      const result = await socketPlaybackAdvance(socket, roomId, videoId);
      if (result.advanced) {
        replaceFromSnapshot(result.snapshot);
      } else {
        endingGuardRef.current = null;
      }
    } catch {
      endingGuardRef.current = null;
    }
  }, [replaceFromSnapshot, roomId, session.nowPlaying]);

  const retry = useCallback(() => {
    window.location.reload();
  }, []);

  return {
    session,
    guest,
    currentUser,
    actor,
    busy,
    actionError,
    addTrack,
    vote,
    removeTrack,
    sendChat,
    sendVoice,
    advanceOnEnded,
    retry,
  };
}
