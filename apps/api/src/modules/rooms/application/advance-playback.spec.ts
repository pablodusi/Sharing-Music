import { RoomsService } from './rooms.service';

describe('RoomsService.advancePlayback idempotency', () => {
  it('skips advance when ending video id no longer matches playback', async () => {
    const getSnapshot = jest.fn().mockResolvedValue({
      playback: { youtubeVideoId: 'video-B' },
      queue: [],
    });

    const transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ youtube_video_id: 'video-B' }]),
        queueItem: { findMany: jest.fn() },
        roomPlayback: { update: jest.fn() },
        queueVote: { deleteMany: jest.fn() },
        message: { create: jest.fn() },
      };
      return fn(tx);
    });

    const roomsRepository = {
      findById: jest.fn().mockResolvedValue({ id: 'room-1' }),
      isMember: jest.fn().mockResolvedValue(true),
      getSnapshot,
      prismaClient: { $transaction: transaction },
    };

    const guestsService = {
      ensureGuest: jest.fn().mockResolvedValue({
        id: 'user-1',
        displayName: 'Ada',
      }),
    };

    const service = new RoomsService(
      roomsRepository as never,
      guestsService as never,
      { saveVoiceFile: jest.fn() } as never,
      {
        getListenerCount: () => 0,
        getLiveUserIds: () => [],
        getPresenceSnapshot: () => ({
          listenerCount: 0,
          liveUserIds: [],
          liveParticipants: [],
        }),
      } as never,
    );

    const result = await service.advancePlayback(
      'room-1',
      { guestId: 'guest_aaaaaaaa', displayName: 'Ada' },
      'video-A',
    );

    expect(result.advanced).toBe(false);
    expect(getSnapshot).toHaveBeenCalled();
  });
});
