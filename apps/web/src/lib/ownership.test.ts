import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canVoteOnQueueItem,
  canRemoveQueueItem,
} from "./queue";
import { isOwnedByActor, isStableId } from "./ownership";
import type { LocalUser, QueueItem, Track } from "./types";
import {
  applyFullSnapshot,
  createEmptySession,
} from "./api/room-session-state";
import type { ApiRoomSnapshot } from "./api/types";
import { mapApiUser, mapSnapshotToRoomState, resolveMyUserId } from "./api/snapshot";

const alice: LocalUser = {
  id: "user-alice-001",
  name: "Alice",
  avatarColor: "#a78bfa",
  initial: "A",
  guestKey: "guest-alice-key",
};

const bob: LocalUser = {
  id: "user-bob-00002",
  name: "Bob",
  avatarColor: "#34d399",
  initial: "B",
  guestKey: "guest-bob-key00",
};

function track(id: string): Track {
  return {
    id,
    title: id,
    artist: "Artist",
    album: "Album",
    durationMs: 180_000,
    youtubeVideoId: `yt-${id}`,
  };
}

function queueItem(owner: LocalUser, id = "qi-1"): QueueItem {
  return {
    track: track(id),
    votes: 0,
    addedAt: Date.now(),
    joinedOrder: 0,
    addedBy: owner,
  };
}

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

function makeSnapshot(
  overrides: Partial<ApiRoomSnapshot> = {},
): ApiRoomSnapshot {
  const aliceUser = baseUser("user-alice-001", "guest-alice-key", "Alice");
  const bobUser = baseUser("user-bob-00002", "guest-bob-key00", "Bob");
  return {
    id: "room-1",
    name: "Test Room",
    description: "Ownership",
    isPrivate: false,
    inviteCode: null,
    sharePath: "/rooms/room-1",
    shareUrlPath: "/rooms/room-1",
    ownerId: aliceUser.id,
    createdAt: new Date().toISOString(),
    members: [
      {
        id: "m1",
        role: "OWNER",
        joinedAt: new Date().toISOString(),
        user: aliceUser,
      },
      {
        id: "m2",
        role: "LISTENER",
        joinedAt: new Date().toISOString(),
        user: bobUser,
      },
    ],
    playback: {
      youtubeVideoId: "nowplaying1",
      trackTitle: "Now",
      trackArtist: "Artist",
      trackAlbum: "YouTube",
      durationMs: 180000,
      positionMs: 0,
      isPlaying: true,
      updatedAt: new Date().toISOString(),
      addedBy: aliceUser,
    },
    queue: [
      {
        id: "qi-alice-song",
        youtubeVideoId: "songalice1",
        title: "Alice Song",
        artist: "Artist",
        album: "YouTube",
        durationMs: 200000,
        addedAt: new Date().toISOString(),
        addedBy: aliceUser,
        votes: 0,
        voteCount: 0,
      },
    ],
    votesByUser: {},
    messages: [],
    ...overrides,
  };
}

describe("isOwnedByActor", () => {
  it("matches by server User.id", () => {
    assert.equal(
      isOwnedByActor(alice, { userId: "user-alice-001", guestId: null }),
      true,
    );
    assert.equal(
      isOwnedByActor(alice, { userId: "user-bob-00002", guestId: null }),
      false,
    );
  });

  it("matches by guestKey when User.id is unknown", () => {
    assert.equal(
      isOwnedByActor(alice, {
        userId: null,
        guestId: "guest-alice-key",
      }),
      true,
    );
    assert.equal(
      isOwnedByActor(alice, {
        userId: null,
        guestId: "guest-bob-key00",
      }),
      false,
    );
  });

  it("rejects placeholder ids like me/guest", () => {
    assert.equal(isStableId("me"), false);
    assert.equal(isStableId("guest"), false);
    assert.equal(
      isOwnedByActor(alice, { userId: "me", guestId: "me" }),
      false,
    );
  });
});

describe("queue ownership voting rules", () => {
  it("User A owns their song; User B can vote", () => {
    const item = queueItem(alice);
    const aliceActor = { userId: alice.id, guestId: alice.guestKey };
    const bobActor = { userId: bob.id, guestId: bob.guestKey };

    assert.equal(canVoteOnQueueItem(item, aliceActor), false);
    assert.equal(canRemoveQueueItem(item, aliceActor), true);
    assert.equal(canVoteOnQueueItem(item, bobActor), true);
    assert.equal(canRemoveQueueItem(item, bobActor), false);
  });
});

describe("ownership after refresh (A/B sessions)", () => {
  it("User A adds a song; User B joins and can vote", () => {
    const snapshot = makeSnapshot();
    const bobSession = applyFullSnapshot(
      createEmptySession(),
      snapshot,
      "guest-bob-key00",
    );
    const aliceSong = bobSession.queue[0];
    assert.equal(aliceSong.addedBy.id, "user-alice-001");
    assert.equal(aliceSong.addedBy.guestKey, "guest-alice-key");
    assert.equal(bobSession.myUserId, "user-bob-00002");

    const bobActor = {
      userId: bobSession.myUserId,
      guestId: "guest-bob-key00",
    };
    assert.equal(isOwnedByActor(aliceSong.addedBy, bobActor), false);
    assert.equal(canVoteOnQueueItem(aliceSong, bobActor), true);
  });

  it("User B refreshes and still sees it as User A’s song and can vote", () => {
    const snapshot = makeSnapshot();
    // Simulate refresh: same guestKey from localStorage, fresh snapshot apply.
    const afterRefresh = applyFullSnapshot(
      createEmptySession(),
      snapshot,
      "guest-bob-key00",
    );
    const aliceSong = afterRefresh.queue[0];
    const bobActor = {
      userId: afterRefresh.myUserId,
      guestId: "guest-bob-key00",
    };

    assert.equal(afterRefresh.myUserId, "user-bob-00002");
    assert.equal(aliceSong.addedBy.id, "user-alice-001");
    assert.equal(isOwnedByActor(aliceSong.addedBy, bobActor), false);
    assert.equal(canVoteOnQueueItem(aliceSong, bobActor), true);
  });

  it("User A refreshes and still sees it as their own song", () => {
    const snapshot = makeSnapshot();
    const afterRefresh = applyFullSnapshot(
      createEmptySession(),
      snapshot,
      "guest-alice-key",
    );
    const aliceSong = afterRefresh.queue[0];
    const aliceActor = {
      userId: afterRefresh.myUserId,
      guestId: "guest-alice-key",
    };

    assert.equal(afterRefresh.myUserId, "user-alice-001");
    assert.equal(isOwnedByActor(aliceSong.addedBy, aliceActor), true);
    assert.equal(canVoteOnQueueItem(aliceSong, aliceActor), false);
    assert.equal(canRemoveQueueItem(aliceSong, aliceActor), true);
  });

  it("does not resolve myUserId to the owner when guestKeys are missing", () => {
    const snapshot = makeSnapshot({
      members: [
        {
          id: "m1",
          role: "OWNER",
          joinedAt: new Date().toISOString(),
          user: baseUser("user-alice-001", null as unknown as string, "Alice"),
        },
        {
          id: "m2",
          role: "LISTENER",
          joinedAt: new Date().toISOString(),
          user: {
            ...baseUser("user-bob-00002", "guest-bob-key00", "Bob"),
            guestKey: null,
          },
        },
      ],
    });
    // Force null guestKeys on members (simulates stripped payload).
    snapshot.members[0].user.guestKey = null;
    snapshot.members[1].user.guestKey = null;

    assert.equal(resolveMyUserId(snapshot, "guest-bob-key00"), null);
    assert.equal(resolveMyUserId(snapshot, ""), null);
  });

  it("preserves addedBy id and guestKey through the snapshot mapper", () => {
    const mapped = mapSnapshotToRoomState(makeSnapshot(), "guest-bob-key00");
    assert.equal(mapped.queue[0].addedBy.id, "user-alice-001");
    assert.equal(mapped.queue[0].addedBy.guestKey, "guest-alice-key");
    assert.equal(mapped.nowPlaying?.addedBy.id, "user-alice-001");
    assert.equal(mapped.nowPlaying?.addedBy.guestKey, "guest-alice-key");

    const apiUser = mapApiUser(
      baseUser("user-alice-001", "guest-alice-key", "Alice"),
    );
    assert.equal(apiUser.id, "user-alice-001");
    assert.equal(apiUser.guestKey, "guest-alice-key");
  });
});
