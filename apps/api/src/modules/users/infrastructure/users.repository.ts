import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../../common/types/authenticated-user.type';
import { UserProfile } from '../domain/user.entity';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByAuth0Id(auth0Id: string): Promise<UserProfile | null> {
    return this.prisma.user.findUnique({ where: { auth0Id } });
  }

  async findById(id: string): Promise<UserProfile | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async upsertFromAuth0(user: AuthenticatedUser): Promise<UserProfile> {
    const email = user.email ?? `${user.auth0Id}@users.local`;
    const username =
      user.username ??
      user.email?.split('@')[0] ??
      `user_${user.auth0Id.replace(/\|/g, '_')}`;

    return this.prisma.user.upsert({
      where: { auth0Id: user.auth0Id },
      update: {
        email,
        displayName: user.displayName ?? username,
        avatarUrl: user.avatarUrl,
        isGuest: false,
      },
      create: {
        auth0Id: user.auth0Id,
        email,
        username,
        displayName: user.displayName ?? username,
        avatarUrl: user.avatarUrl,
        isGuest: false,
      },
    });
  }
}
