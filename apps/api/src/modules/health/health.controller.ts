import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    await this.redis.getClient().ping();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
