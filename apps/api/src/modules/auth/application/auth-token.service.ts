import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { AuthenticatedUser, JwtPayload } from '../../../common/types/authenticated-user.type';

@Injectable()
export class AuthTokenService {
  private readonly client: jwksClient.JwksClient;
  private readonly audience: string;
  private readonly issuer: string;

  constructor(configService: ConfigService) {
    const domain = configService.getOrThrow<string>('AUTH0_DOMAIN');
    this.audience = configService.getOrThrow<string>('AUTH0_AUDIENCE');
    this.issuer = configService.getOrThrow<string>('AUTH0_ISSUER_URL');

    this.client = jwksClient({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://${domain}/.well-known/jwks.json`,
    });
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    try {
      const decoded = jwt.decode(token, { complete: true });

      if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
        throw new UnauthorizedException('Invalid access token');
      }

      const key = await this.client.getSigningKey(decoded.header.kid);
      const signingKey = key.getPublicKey();

      const payload = jwt.verify(token, signingKey, {
        audience: this.audience,
        issuer: this.issuer,
        algorithms: ['RS256'],
      }) as JwtPayload;

      return {
        auth0Id: payload.sub,
        email: payload.email,
        username: payload.nickname,
        displayName: payload.name,
        avatarUrl: payload.picture,
      };
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }
}
