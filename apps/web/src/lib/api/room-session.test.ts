import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveMediaUrl } from "../env";
import {
  appendMessageUnique,
  mapApiMessage,
  mapSnapshotToRoomState,
  mergeMessagesById,
  myVoteFromVotes,
} from "./snapshot";
import {
  applyChatMessage,
  applyFullSnapshot,
  applyQueuePatch,
  applyVotePatch,
  createEmptySession,
} from "./room-session-state";
import type { ApiRoomSnapshot } from "./types";

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
  const alice = baseUser("user-a", "guest-alice-key", "Alice");
  const bob = baseUser("user-b", "guest-bob-key", "Bob");
  return {
    id: "room-1",
    name: "Test Room",
    description: "Phase 4",
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
    playback: {
      youtubeVideoId: "abc1234",
      trackTitle: "Song A",
      trackArtist: "Artist",
      trackAlbum: "YouTube",
      durationMs: 180000,
      positionMs: 0,
      isPlaying: true,
      updatedAt: new Date().toISOString(),
      addedBy: alice,
    },
    queue: [
      {
        id: "qi-1",
        youtubeVideoId: "def5678",
        title: "Song B",
        artist: "Artist",
        album: "YouTube",
        durationMs: 200000,
        addedAt: new Date(Date.now() - 10_000).toISOString(),
        addedBy: bob,
        votes: 1,
        voteCount: 1,
      },
      {
        id: "qi-2",
        youtubeVideoId: "ghi9012",
        title: "Song C",
        artist: "Artist",
        album: "YouTube",
        durationMs: 190000,
        addedAt: new Date().toISOString(),
        addedBy: alice,
        votes: 0,
        voteCount: 0,
      },
    ],
    votesByUser: {
      "user-a": "qi-1",
    },
    messages: [
      {
        id: "msg-sys-1",
        type: "SYSTEM",
        content: "Alice joined the room",
        audioUrl: null,
        audioDurationMs: null,
        createdAt: new Date().toISOString(),
        author: null,
      },
      {
        id: "msg-chat-1",
        type: "TEXT",
        content: "hello",
        audioUrl: null,
        audioDurationMs: null,
        createdAt: new Date().toISOString(),
        author: alice,
      },
    ],
    ...overrides,
  };
}

describe("Phase 4 snapshot mapping", () => {
  it("maps queue ids so votes use queueItemId", () => {
    const mapped = mapSnapshotToRoomState(makeSnapshot(), "guest-alice-key");
    assert.equal(mapped.queue[0].track.id, "qi-1");
    assert.equal(mapped.voteState.myVoteTrackId, "qi-1");
    assert.equal(mapped.myUserId, "user-a");
    assert.equal(mapped.nowPlaying?.track.youtubeVideoId, "abc1234");
    assert.equal(mapped.nowPlaying?.positionMs, 0);
    assert.equal(mapped.nowPlaying?.isPlaying, true);
    assert.ok(mapped.nowPlaying?.updatedAt);
    assert.equal(mapped.nowPlaying?.addedBy.id, "user-a");
    assert.equal(mapped.nowPlaying?.addedBy.guestKey, "guest-alice-key");
    assert.equal(mapped.queue[0].addedBy.id, "user-b");
    assert.equal(mapped.queue[0].addedBy.guestKey, "guest-bob-key");
  });

  it("preserves mid-track playback clock fields for late join sync", () => {
    const updatedAt = "2026-07-17T15:00:00.000Z";
    const mapped = mapSnapshotToRoomState(
      makeSnapshot({
        playback: {
          youtubeVideoId: "abc1234",
          trackTitle: "Song A",
          trackArtist: "Artist",
          trackAlbum: "YouTube",
          durationMs: 180000,
          positionMs: 12_000,
          isPlaying: true,
          updatedAt,
          addedBy: baseUser("user-a", "guest-alice-key", "Alice"),
        },
      }),
      "guest-bob-key",
    );
    assert.equal(mapped.nowPlaying?.positionMs, 12_000);
    assert.equal(mapped.nowPlaying?.isPlaying, true);
    assert.equal(mapped.nowPlaying?.updatedAt, updatedAt);
    assert.equal(mapped.nowPlaying?.track.youtubeVideoId, "abc1234");
  });

  it("resolves voice message URLs against API origin", () => {
    process.env.NEXT_PUBLIC_SOCKET_URL = "http://localhost:3001";
    const mapped = mapApiMessage({
      id: "v1",
      type: "VOICE",
      content: "Voice message",
      audioUrl: "/uploads/voice/clip.webm",
      audioDurationMs: 1500,
      createdAt: new Date().toISOString(),
      author: baseUser("user-a", "guest-alice-key", "Alice"),
    });
    assert.equal(mapped.type, "voice");
    assert.equal(
      mapped.audioUrl,
      "http://localhost:3001/uploads/voice/clip.webm",
    );
    assert.equal(resolveMediaUrl("/uploads/voice/clip.webm"), mapped.audioUrl);
  });
});

describe("Phase 4 two-client convergence", () => {
  it("two clients applying the same queue and chat events end equal", () => {
    const snapshot = makeSnapshot();
    let alice = applyFullSnapshot(
      createEmptySession(),
      snapshot,
      "guest-alice-key",
    );
    let bob = applyFullSnapshot(
      createEmptySession(),
      snapshot,
      "guest-bob-key",
    );

    const queueEvent = {
      queue: [
        {
          ...snapshot.queue[0],
          votes: 2,
          voteCount: 2,
        },
        snapshot.queue[1],
      ],
      messages: snapshot.messages,
    };

    alice = applyQueuePatch(alice, queueEvent);
    bob = applyQueuePatch(bob, queueEvent);

    const chat = {
      id: "msg-chat-2",
      type: "TEXT" as const,
      content: "same for both",
      audioUrl: null,
      audioDurationMs: null,
      createdAt: new Date().toISOString(),
      author: baseUser("user-b", "guest-bob-key", "Bob"),
    };

    alice = applyChatMessage(alice, chat);
    bob = applyChatMessage(bob, chat);

    assert.deepEqual(
      alice.queue.map((q) => ({ id: q.track.id, votes: q.votes })),
      bob.queue.map((q) => ({ id: q.track.id, votes: q.votes })),
    );
    assert.deepEqual(
      alice.messages.map((m) => m.id),
      bob.messages.map((m) => m.id),
    );
    assert.equal(alice.messages.at(-1)?.content, "same for both");
    assert.equal(bob.messages.at(-1)?.content, "same for both");
  });

  it("reconnect snapshot replaces local room state", () => {
    let state = applyFullSnapshot(
      createEmptySession(),
      makeSnapshot(),
      "guest-alice-key",
    );
    state = applyChatMessage(state, {
      id: "stale-local",
      author: "Alice",
      kind: "user",
      type: "text",
      content: "should disappear on sync",
      timestamp: "12:00",
    });

    const fresh = makeSnapshot({
      messages: [
        {
          id: "msg-sys-1",
          type: "SYSTEM",
          content: "Alice joined the room",
          audioUrl: null,
          audioDurationMs: null,
          createdAt: new Date().toISOString(),
          author: null,
        },
      ],
      queue: [],
      votesByUser: {},
      playback: null,
    });

    state = applyFullSnapshot(state, fresh, "guest-alice-key", "connected");
    assert.equal(state.messages.length, 1);
    assert.equal(state.messages[0].id, "msg-sys-1");
    assert.equal(state.queue.length, 0);
    assert.equal(state.nowPlaying, null);
    assert.ok(!state.messages.some((m) => m.id === "stale-local"));
  });

  it("vote movement updates myVoteTrackId from votesByUser", () => {
    let state = applyFullSnapshot(
      createEmptySession(),
      makeSnapshot(),
      "guest-alice-key",
    );
    assert.equal(state.voteState.myVoteTrackId, "qi-1");

    state = applyVotePatch(state, {
      queue: makeSnapshot().queue.map((item) =>
        item.id === "qi-2"
          ? { ...item, votes: 1, voteCount: 1 }
          : { ...item, votes: 0, voteCount: 0 },
      ),
      votesByUser: { "user-a": "qi-2" },
    });

    assert.equal(state.voteState.myVoteTrackId, "qi-2");
    assert.equal(
      myVoteFromVotes({ "user-a": "qi-2" }, "user-a").myVoteTrackId,
      "qi-2",
    );
  });

  it("does not duplicate system messages when merging by id", () => {
    const sys = {
      id: "msg-sys-1",
      author: "system",
      kind: "system" as const,
      content: "Alice joined the room",
      timestamp: "12:00",
    };
    const once = appendMessageUnique([sys], sys);
    assert.equal(once.length, 1);

    const merged = mergeMessagesById(
      [sys, { id: "m2", author: "Bob", content: "hi", timestamp: "12:01" }],
      [sys, { id: "m3", author: "Alice", content: "hey", timestamp: "12:02" }],
    );
    assert.equal(merged.filter((m) => m.id === "msg-sys-1").length, 1);
    assert.equal(merged.length, 3);
  });
});
