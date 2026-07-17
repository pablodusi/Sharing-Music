import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { GuestIdentity } from '../../common/types/guest-identity.type';

@Injectable()
export class GuestsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert a lightweight guest user from client-provided guestId + displayName.
   */
  async ensureGuest(identity: GuestIdentity): Promise<User> {
    const existing = await this.prisma.user.findUnique({
      where: { guestKey: identity.guestId },
    });

    if (existing) {
      if (existing.displayName !== identity.displayName) {
        return this.prisma.user.update({
          where: { id: existing.id },
          data: { displayName: identity.displayName },
        });
      }
      return existing;
    }

    const username = `guest_${identity.guestId.slice(0, 24)}`;

    return this.prisma.user.create({
      data: {
        guestKey: identity.guestId,
        username,
        displayName: identity.displayName,
        isGuest: true,
        auth0Id: null,
        email: null,
      },
    });
  }
}
