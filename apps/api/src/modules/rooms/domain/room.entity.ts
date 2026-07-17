/**
 * Room entity shapes for summaries (list views).
 * Full room state for clients uses RoomsRepository.getSnapshot().
 */
export type RoomSummary = {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  inviteCode: string | null;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  memberCount: number;
  sharePath: string;
};
