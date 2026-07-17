import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthTokenService } from './application/auth-token.service';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';
import { AuthController } from './presentation/auth.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), UsersModule],
  controllers: [AuthController],
  providers: [JwtStrategy, AuthTokenService],
  exports: [PassportModule, AuthTokenService],
})
export class AuthModule {}
