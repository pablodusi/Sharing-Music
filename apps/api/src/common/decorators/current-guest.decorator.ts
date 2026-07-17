import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GuestIdentity } from '../types/guest-identity.type';

type GuestRequest = { guest?: GuestIdentity };

export const CurrentGuest = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): GuestIdentity => {
    const request = ctx.switchToHttp().getRequest<GuestRequest>();
    return request.guest!;
  },
);
