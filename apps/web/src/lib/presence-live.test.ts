import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyFullSnapshot,
  applyMemberLeft,
  applyPresenceUpdated,
  createEmptySession,
} from "./api/room-session-state";
import type { ApiRoomSnapshot } from "./api/types";

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

function twoUserSnapshot(): ApiRoomSnapshot {
  const alice = baseUser("user-alice-001", "guest-alice-key", "Alice");
  const bob = baseUser("user-bob-00002", "guest-bob-key00", "Bob");
  return {
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
    ],
    listenerCount: 2,
    liveUserIds: [alice.id, bob.id],
    liveParticipants: [
      { userId: alice.id, displayName: "Alice", role: "OWNER" },
      { userId: bob.id, displayName: "Bob", role: "LISTENER" },
    ],
    playback: null,
    queue: [],
    votesByUser: {},
    messages: [],
  };
}

describe("live presence UI updates without refresh", () => {
  it("two users join then B disconnects — A updates immediately", () => {
    let aliceView = applyFullSnapshot(
      createEmptySession(),
      twoUserSnapshot(),
      "guest-alice-key",
    );
    assert.equal(aliceView.room.listenerCount, 2);
    assert.equal(aliceView.participants.length, 2);
    assert.ok(aliceView.participants.some((p) => p.id === "user-bob-00002"));

    // member.left arrives first with stable userId
    aliceView = applyMemberLeft(aliceView, {
      userId: "user-bob-00002",
      listenerCount: 1,
    });
    assert.equal(aliceView.participants.length, 1);
    assert.equal(aliceView.room.listenerCount, 1);
    assert.ok(!aliceView.participants.some((p) => p.id === "user-bob-00002"));

    // presence.updated follows with authoritative roster
    aliceView = applyPresenceUpdated(aliceView, {
      listenerCount: 1,
      liveUserIds: ["user-alice-001"],
      liveParticipants: [
        { userId: "user-alice-001", displayName: "Alice", role: "OWNER" },
      ],
    });
    assert.equal(aliceView.room.listenerCount, 1);
    assert.equal(aliceView.participants.length, 1);
    assert.equal(aliceView.participants[0].id, "user-alice-001");
  });

  it("presence.updated can add a returning member without full snapshot", () => {
    let view = applyFullSnapshot(
      createEmptySession(),
      {
        ...twoUserSnapshot(),
        listenerCount: 1,
        liveUserIds: ["user-alice-001"],
        liveParticipants: [
          { userId: "user-alice-001", displayName: "Alice", role: "OWNER" },
        ],
      },
      "guest-alice-key",
    );
    assert.equal(view.participants.length, 1);

    view = applyPresenceUpdated(view, {
      listenerCount: 2,
      liveUserIds: ["user-alice-001", "user-bob-00002"],
      liveParticipants: [
        { userId: "user-alice-001", displayName: "Alice", role: "OWNER" },
        { userId: "user-bob-00002", displayName: "Bob", role: "LISTENER" },
      ],
    });
    assert.equal(view.room.listenerCount, 2);
    assert.equal(view.participants.length, 2);
    assert.ok(view.participants.some((p) => p.id === "user-bob-00002"));
  });

  it("reconnect snapshot restores live listeners", () => {
    let view = applyFullSnapshot(
      createEmptySession(),
      twoUserSnapshot(),
      "guest-alice-key",
    );
    view = applyMemberLeft(view, {
      userId: "user-bob-00002",
      listenerCount: 1,
    });

    // Simulate reconnect sync with only Alice live
    view = applyFullSnapshot(
      view,
      {
        ...twoUserSnapshot(),
        listenerCount: 1,
        liveUserIds: ["user-alice-001"],
        liveParticipants: [
          { userId: "user-alice-001", displayName: "Alice", role: "OWNER" },
        ],
      },
      "guest-alice-key",
      "connected",
    );

    assert.equal(view.room.listenerCount, 1);
    assert.equal(view.participants.length, 1);
    assert.equal(view.participants[0].id, "user-alice-001");
  });
});
