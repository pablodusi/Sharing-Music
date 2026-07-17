import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { UsersService } from '../application/users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  async getUser(@Param('id') id: string) {
    const user = await this.usersService.getById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}
