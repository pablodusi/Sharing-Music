/**
 * Stable identity for ownership / voting — never display name, initials, or "me".
 */
export type StableActorIdentity = {
  /** Server `User.id` when known from membership. */
  userId?: string | null;
  /** Persisted client guest key (`localStorage` / `User.guestKey`). */
  guestId?: string | null;
};

export type StableOwnerRef = {
  /** Server `User.id` of the owner. */
  id: string;
  /** Guest key when the owner is a guest; omitted/null for Auth0 users. */
  guestKey?: string | null;
};

/** Reject empty / placeholder ids like "" , "me", "guest". */
export function isStableId(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length >= 8;
}

/**
 * True when `owner` is the same person as `actor`.
 * Prefer User.id; fall back to matching guestKey ↔ guestId.
 */
export function isOwnedByActor(
  owner: StableOwnerRef,
  actor: StableActorIdentity,
): boolean {
  if (isStableId(actor.userId) && owner.id === actor.userId) {
    return true;
  }
  if (
    isStableId(actor.guestId) &&
    isStableId(owner.guestKey) &&
    owner.guestKey === actor.guestId
  ) {
    return true;
  }
  return false;
}

/** Normalize string-or-actor inputs used by legacy queue helpers. */
export function toStableActor(
  actor: StableActorIdentity | string,
): StableActorIdentity {
  if (typeof actor === "string") {
    return isStableId(actor) ? { userId: actor } : {};
  }
  return actor;
}
