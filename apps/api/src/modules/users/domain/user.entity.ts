export interface UserProfile {
  id: string;
  auth0Id: string | null;
  guestKey: string | null;
  email: string | null;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isGuest: boolean;
  createdAt: Date;
}
