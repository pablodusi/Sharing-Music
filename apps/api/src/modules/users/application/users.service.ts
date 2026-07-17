import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/types/authenticated-user.type';
import { UserProfile } from '../domain/user.entity';
import { UsersRepository } from '../infrastructure/users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  syncFromAuth0(user: AuthenticatedUser): Promise<UserProfile> {
    return this.usersRepository.upsertFromAuth0(user);
  }

  getById(id: string): Promise<UserProfile | null> {
    return this.usersRepository.findById(id);
  }
}
