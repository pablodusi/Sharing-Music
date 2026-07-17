import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyFullSnapshot,
  applyPresenceUpdated,
  createEmptySession,
} from "./api/room-session-state";
import { mapSummaryToRoom, mapSnapshotToRoomState } from "./api/snapshot";
import type { ApiRoomSnapshot, ApiRoomSummary } from "./api/types";

function baseUser(id: string, guestKey: string, name: string) {
  return {
    id,
    username: name.toLowerCase(),
    displayName: name,
    avatarUrl: null,
    isGuest: true,
    guestKey,
  };
}

describe("restart recovery / live presence mapping", () => {
  it("room list uses live listenerCount and persisted playback", () => {
    const summary: ApiRoomSummary = {
      id: "room-1",
      name: "Test",
      description: null,
      isPrivate: false,
      inviteCode: null,
      ownerId: "user-a",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      memberCount: 5,
      listenerCount: 2,
      sharePath: "/rooms/room-1",
      playback: {
        youtubeVideoId: "abc1234",
        trackTitle: "Song A",
        trackArtist: "Artist",
        trackAlbum: "YouTube",
        durationMs: 180000,
        positionMs: 0,
        isPlaying: true,
        updatedAt: new Date().toISOString(),
        addedBy: baseUser("user-a", "guest-alice-key", "Alice"),
      },
    };

    const room = mapSummaryToRoom(summary);
    assert.equal(room.listenerCount, 2);
    assert.equal(room.currentTrack?.track.youtubeVideoId, "abc1234");
  });

  it("snapshot prefers live listenerCount over members.length", () => {
    const alice = baseUser("user-alice-001", "guest-alice-key", "Alice");
    const bob = baseUser("user-bob-00002", "guest-bob-key00", "Bob");
    const carol = baseUser("user-carol-0003", "guest-carol-key0", "Carol");

    const snapshot: ApiRoomSnapshot = {
      id: "room-1",
      name: "Test",
      description: null,
      isPrivate: false,
      inviteCode: null,
      sharePath: "/rooms/room-1",
      shareUrlPath: "/rooms/room-1",
      ownerId: alice.id,
      createdAt: new Date().toISOString(),
      members: [
        {
          id: "m1",
          role: "OWNER",
          joinedAt: new Date().toISOString(),
          user: alice,
        },
        {
          id: "m2",
          role: "LISTENER",
          joinedAt: new Date().toISOString(),
          user: bob,
        },
        {
          id: "m3",
          role: "LISTENER",
          joinedAt: new Date().toISOString(),
          user: carol,
        },
      ],
      listenerCount: 2,
      liveUserIds: [alice.id, bob.id],
      playback: {
        youtubeVideoId: "abc1234",
        trackTitle: "Song A",
        trackArtist: "Artist",
        trackAlbum: "YouTube",
        durationMs: 180000,
        positionMs: 0,
        isPlaying: true,
        updatedAt: new Date(Date.now() - 30_000).toISOString(),
        addedBy: alice,
      },
      queue: [],
      votesByUser: {},
      messages: [],
    };

    const mapped = mapSnapshotToRoomState(snapshot, "guest-bob-key00");
    assert.equal(mapped.room.listenerCount, 2);
    assert.equal(mapped.participants.length, 2);
    assert.ok(mapped.participants.every((p) => p.id !== carol.id));
    assert.equal(mapped.nowPlaying?.track.youtubeVideoId, "abc1234");

    const session = applyFullSnapshot(
      createEmptySession(),
      snapshot,
      "guest-bob-key00",
    );
    assert.equal(session.room.listenerCount, 2);

    const afterDisconnect = applyPresenceUpdated(session, {
      listenerCount: 1,
      liveUserIds: [alice.id],
    });
    assert.equal(afterDisconnect.room.listenerCount, 1);
    assert.equal(afterDisconnect.participants.length, 1);
  });
});
