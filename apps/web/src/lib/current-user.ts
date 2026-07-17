import type { LocalUser } from "./types";
import { ensureGuestIdentity, guestToLocalUser } from "./guest-identity";

/**
 * @deprecated Do not use for room ownership / voting.
 * Prefer ensureGuestIdentity() + session.myUserId via useRoomSession().actor.
 */
export function getCurrentGuestUser(): LocalUser {
  return guestToLocalUser(ensureGuestIdentity());
}
