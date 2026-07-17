import type { RoundVoteState } from "./types";

const VOTES_PREFIX = "sharing-music:round-vote:";

function isBrowser() {
  return typeof window !== "undefined";
}

export function loadRoundVote(roomId: string): RoundVoteState {
  if (!isBrowser()) {
    return { myVoteTrackId: null };
  }

  try {
    const raw = window.localStorage.getItem(`${VOTES_PREFIX}${roomId}`);
    if (!raw) {
      return { myVoteTrackId: null };
    }

    const parsed = JSON.parse(raw) as RoundVoteState;
    return {
      myVoteTrackId: parsed.myVoteTrackId ?? null,
    };
  } catch {
    return { myVoteTrackId: null };
  }
}

export function saveRoundVote(roomId: string, state: RoundVoteState) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(
    `${VOTES_PREFIX}${roomId}`,
    JSON.stringify(state),
  );
}

export function clearRoundVote(roomId: string) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(`${VOTES_PREFIX}${roomId}`);
}
