import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(
    err: Error | null,
    user: TUser,
    _info: unknown,
    _context: ExecutionContext,
  ): TUser | null {
    if (err) {
      return null;
    }

    return user ?? null;
  }
}
