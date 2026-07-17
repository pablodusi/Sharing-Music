import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { passportJwtSecret } from 'jwks-rsa';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser, JwtPayload } from '../../../../common/types/authenticated-user.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const domain = configService.getOrThrow<string>('AUTH0_DOMAIN');
    const audience = configService.getOrThrow<string>('AUTH0_AUDIENCE');
    const issuer = configService.getOrThrow<string>('AUTH0_ISSUER_URL');

    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${domain}/.well-known/jwks.json`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience,
      issuer,
      algorithms: ['RS256'],
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    return {
      auth0Id: payload.sub,
      email: payload.email,
      username: payload.nickname,
      displayName: payload.name,
      avatarUrl: payload.picture,
    };
  }
}
