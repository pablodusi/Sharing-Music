export interface AuthenticatedUser {
  auth0Id: string;
  email?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface JwtPayload {
  sub: string;
  email?: string;
  nickname?: string;
  name?: string;
  picture?: string;
  permissions?: string[];
}
