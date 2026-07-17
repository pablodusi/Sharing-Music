import type { LocalUser } from "./types";

const GUEST_ID_KEY = "sharing-music:guest-id";
const GUEST_NAME_KEY = "sharing-music:guest-name";

export type GuestIdentity = {
  guestId: string;
  displayName: string;
};

function isBrowser() {
  return typeof window !== "undefined";
}

function randomGuestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  }
  return `guest_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`.slice(
    0,
    24,
  );
}

function avatarColorFromId(id: string): string {
  const palette = [
    "#a78bfa",
    "#34d399",
    "#f472b6",
    "#60a5fa",
    "#fbbf24",
    "#fb7185",
    "#2dd4bf",
    "#c084fc",
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}

/** Ensure a stable guest id + display name exist in localStorage. */
export function ensureGuestIdentity(): GuestIdentity {
  if (!isBrowser()) {
    return { guestId: "ssr-guest-placeholder", displayName: "Guest" };
  }

  let guestId = window.localStorage.getItem(GUEST_ID_KEY);
  if (!guestId || guestId.length < 8) {
    guestId = randomGuestId();
    window.localStorage.setItem(GUEST_ID_KEY, guestId);
  }

  let displayName = window.localStorage.getItem(GUEST_NAME_KEY)?.trim() || "";
  if (!displayName) {
    displayName = `Guest-${guestId.slice(-4)}`;
    window.localStorage.setItem(GUEST_NAME_KEY, displayName);
  }

  return { guestId, displayName };
}

export function setGuestDisplayName(name: string): GuestIdentity {
  const identity = ensureGuestIdentity();
  const displayName = name.trim().slice(0, 32) || identity.displayName;
  if (isBrowser()) {
    window.localStorage.setItem(GUEST_NAME_KEY, displayName);
  }
  return { guestId: identity.guestId, displayName };
}

export function guestToLocalUser(
  identity: GuestIdentity,
  userId?: string | null,
): LocalUser {
  // Prefer server User.id for `id` when known; always keep guestKey for
  // ownership checks that must survive refresh without mixing identities.
  const id =
    typeof userId === "string" && userId.length >= 8
      ? userId
      : identity.guestId;
  const name = identity.displayName;
  return {
    id,
    name,
    avatarColor: avatarColorFromId(id),
    initial: name.slice(0, 1).toUpperCase() || "G",
    guestKey: identity.guestId,
  };
}

export function colorForUserId(userId: string): string {
  return avatarColorFromId(userId);
}
