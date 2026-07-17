import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addedToUpNextMessage,
  createSystemMessage,
  isSystemMessage,
  movedVoteMessage,
  nowPlayingAutoMessage,
  removedFromUpNextMessage,
  startedPlayingMessage,
  votedForMessage,
} from "./system-messages";

const user = { name: "me" };
const song = { title: "Californication" };
const other = { title: "Otherside" };

describe("system message copy", () => {
  it("formats each queue action", () => {
    assert.equal(
      startedPlayingMessage(user, song),
      "me started playing Californication.",
    );
    assert.equal(
      addedToUpNextMessage(user, song),
      "me added Californication to Up Next.",
    );
    assert.equal(
      removedFromUpNextMessage(user, song),
      "me removed Californication from Up Next.",
    );
    assert.equal(
      votedForMessage(user, song),
      "me voted for Californication.",
    );
    assert.equal(
      movedVoteMessage(user, song, other),
      "me moved their vote from Californication to Otherside.",
    );
    assert.equal(
      nowPlayingAutoMessage(song, user),
      "Now playing: Californication, added by me.",
    );
  });

  it("marks created system messages as system", () => {
    const message = createSystemMessage("Room ready.");
    assert.equal(message.kind, "system");
    assert.equal(message.author, "system");
    assert.ok(isSystemMessage(message));
  });
});
