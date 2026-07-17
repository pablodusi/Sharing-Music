import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user.type';
import { UsersService } from '../../users/application/users.service';
import { JwtAuthGuard } from '../infrastructure/guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.syncFromAuth0(user);
  }
}
