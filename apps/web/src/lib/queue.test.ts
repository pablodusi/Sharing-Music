import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addTrackToQueue,
  castOrMoveVote,
  getAddBlockReason,
  sortQueueByVotesStable,
} from "./queue";
import { ROOM_RULES } from "./room-rules";
import type { LocalUser, NowPlaying, QueueItem, Track } from "./types";

const me: LocalUser = {
  id: "user-me-000001",
  name: "Me",
  avatarColor: "#a78bfa",
  initial: "M",
  guestKey: "guest-me-key0001",
};

const other: LocalUser = {
  id: "user-other-0001",
  name: "Other",
  avatarColor: "#34d399",
  initial: "O",
  guestKey: "guest-other-key01",
};

function track(id: string, title = id): Track {
  return {
    id,
    title,
    artist: "Artist",
    album: "Album",
    durationMs: 180_000,
    youtubeVideoId: `yt-${id}`,
  };
}

function item(
  id: string,
  votes: number,
  addedAt: number,
  addedBy: LocalUser = other,
): QueueItem {
  return {
    track: track(id),
    votes,
    addedAt,
    joinedOrder: addedAt,
    addedBy,
  };
}

describe("ROOM_RULES defaults", () => {
  it("allows 3 queued songs, adding while playing, and one active vote", () => {
    assert.equal(ROOM_RULES.maxQueuedSongsPerUser, 3);
    assert.equal(ROOM_RULES.blockAddWhileOwnSongPlaying, false);
    assert.equal(ROOM_RULES.maxActiveVotesPerUser, 1);
  });
});

describe("sortQueueByVotesStable", () => {
  it("orders by votes descending, then oldest addedAt first", () => {
    const queue = [
      item("c", 1, 300),
      item("a", 5, 200),
      item("b", 5, 100),
      item("d", 0, 50),
    ];

    const sorted = sortQueueByVotesStable(queue).map((q) => q.track.id);
    assert.deepEqual(sorted, ["b", "a", "c", "d"]);
  });
});

describe("getAddBlockReason / addTrackToQueue", () => {
  it("does not block adding while own song is Now playing", () => {
    const nowPlaying: NowPlaying = {
      track: track("playing", "Playing"),
      addedBy: me,
      positionMs: 0,
      isPlaying: true,
      updatedAt: new Date().toISOString(),
    };

    assert.equal(
      getAddBlockReason(nowPlaying, [], {
        userId: me.id,
        guestId: me.guestKey,
      }),
      null,
    );

    const result = addTrackToQueue([], track("q1"), me, nowPlaying);
    assert.equal(result.added, true);
  });

  it("blocks at maxQueuedSongsPerUser (3)", () => {
    let queue: QueueItem[] = [];
    for (let i = 1; i <= 3; i += 1) {
      const result = addTrackToQueue(queue, track(`q${i}`), me, null);
      assert.equal(result.added, true);
      queue = result.queue;
    }

    const blocked = getAddBlockReason(null, queue, {
      userId: me.id,
      guestId: me.guestKey,
    });
    assert.ok(blocked);
    assert.equal(blocked?.kind, "queue_limit");
    assert.equal(blocked?.kind === "queue_limit" && blocked.max, 3);

    const fourth = addTrackToQueue(queue, track("q4"), me, null);
    assert.equal(fourth.added, false);
    if (!fourth.added) {
      assert.equal(fourth.reason, "queue_limit");
    }
  });
});

describe("castOrMoveVote", () => {
  it("keeps a single active vote by moving it", () => {
    const queue = [item("a", 0, 1), item("b", 0, 2)];
    const first = castOrMoveVote(queue, { myVoteTrackId: null }, "a", {
      userId: me.id,
      guestId: me.guestKey,
    });
    assert.equal(first.voteState.myVoteTrackId, "a");
    assert.equal(first.queue.find((q) => q.track.id === "a")?.votes, 1);

    const moved = castOrMoveVote(first.queue, first.voteState, "b", {
      userId: me.id,
      guestId: me.guestKey,
    });
    assert.equal(moved.voteState.myVoteTrackId, "b");
    assert.equal(moved.queue.find((q) => q.track.id === "a")?.votes, 0);
    assert.equal(moved.queue.find((q) => q.track.id === "b")?.votes, 1);
  });

  it("blocks voting on your own song", () => {
    const queue = [item("mine", 0, 1, me)];
    const result = castOrMoveVote(queue, { myVoteTrackId: null }, "mine", {
      userId: me.id,
      guestId: me.guestKey,
    });
    assert.equal(result.voteState.myVoteTrackId, null);
    assert.equal(result.queue[0].votes, 0);
  });
});
