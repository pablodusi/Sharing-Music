import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { GuestIdentity } from '../types/guest-identity.type';

const GUEST_ID_HEADER = 'x-guest-id';
const GUEST_NAME_HEADER = 'x-guest-name';

type GuestRequest = Request & { guest?: GuestIdentity };

function sanitizeDisplayName(raw: string): string {
  const trimmed = raw.trim().slice(0, 32);
  return trimmed.length > 0 ? trimmed : 'Guest';
}

function isValidGuestId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{8,64}$/.test(value);
}

/**
 * Minimal guest auth: requires X-Guest-Id (+ optional X-Guest-Name).
 * Not a full authentication system.
 */
@Injectable()
export class GuestIdentityGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<GuestRequest>();
    const guestIdHeader = request.headers[GUEST_ID_HEADER];
    const guestNameHeader = request.headers[GUEST_NAME_HEADER];

    const guestId = Array.isArray(guestIdHeader)
      ? guestIdHeader[0]
      : guestIdHeader;
    const guestName = Array.isArray(guestNameHeader)
      ? guestNameHeader[0]
      : guestNameHeader;

    if (!guestId || !isValidGuestId(guestId)) {
      throw new UnauthorizedException(
        'Missing or invalid X-Guest-Id header (8–64 chars: letters, numbers, _-).',
      );
    }

    request.guest = {
      guestId,
      displayName: sanitizeDisplayName(guestName ?? 'Guest'),
    };

    return true;
  }
}
