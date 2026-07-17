import { Module } from '@nestjs/common';
import { AppConfigModule } from './common/config/config.module';
import { PrismaModule } from './infrastructure/database/prisma.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { PresenceModule } from './modules/realtime/presence.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    UsersModule,
    PresenceModule,
    RoomsModule,
    RealtimeModule,
  ],
})
export class AppModule {}
