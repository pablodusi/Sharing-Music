import { RoomsService } from './rooms.service';
import { isPlaybackInactive } from '../domain/playback-recovery';

describe('RoomsService restart / stale playback recovery', () => {
  function buildService(overrides: {
    playback?: Record<string, unknown> | null;
    queueCount?: number;
    queueItems?: Array<Record<string, unknown>>;
  } = {}) {
    const playback = overrides.playback;
    const getSnapshot = jest.fn().mockResolvedValue({
      id: 'room-1',
      playback: playback
        ? {
            youtubeVideoId: playback.youtubeVideoId,
            trackTitle: playback.trackTitle ?? 'Song',
            isPlaying: playback.isPlaying ?? true,
            positionMs: playback.positionMs ?? 0,
            durationMs: playback.durationMs ?? 180_000,
            updatedAt: playback.updatedAt ?? new Date().toISOString(),
            addedBy: null,
          }
        : null,
      queue: [],
      members: [],
      createdAt: new Date(),
    });

    const roomPlaybackUpdate = jest.fn();
    const queueItemCreate = jest.fn();
    const queueItemFindFirst = jest.fn().mockResolvedValue(null);
    const queueItemCount = jest
      .fn()
      .mockResolvedValue(overrides.queueCount ?? 0);
    const queueItemFindMany = jest
      .fn()
      .mockResolvedValue(overrides.queueItems ?? []);
    const queueItemDelete = jest.fn();
    const queueVoteDeleteMany = jest.fn();
    const messageCreate = jest.fn();

    const transaction = jest.fn(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([
            {
              youtube_video_id:
                (playback?.youtubeVideoId as string | null | undefined) ?? null,
            },
          ]),
          queueItem: {
            findMany: queueItemFindMany,
            delete: queueItemDelete,
          },
          roomPlayback: { update: roomPlaybackUpdate },
          queueVote: { deleteMany: queueVoteDeleteMany },
          message: { create: messageCreate },
        };
        return fn(tx);
      },
    );

    const roomsRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'room-1',
        isPrivate: false,
        ownerId: 'user-1',
      }),
      isMember: jest.fn().mockResolvedValue(true),
      getSnapshot,
      listPublic: jest.fn().mockResolvedValue([
        {
          id: 'room-1',
          name: 'Test',
          description: null,
          isPrivate: false,
          inviteCode: null,
          ownerId: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          memberCount: 3,
          sharePath: '/rooms/room-1',
          playback: playback
            ? {
                youtubeVideoId: playback.youtubeVideoId,
                trackTitle: 'Song',
                trackArtist: 'Artist',
                trackAlbum: 'YouTube',
                durationMs: 180_000,
                positionMs: 0,
                isPlaying: true,
                updatedAt: new Date(),
                addedBy: null,
              }
            : null,
        },
      ]),
      prismaClient: {
        $transaction: transaction,
        roomPlayback: {
          findUnique: jest.fn().mockResolvedValue(
            playback
              ? {
                  roomId: 'room-1',
                  ...playback,
                  updatedAt:
                    playback.updatedAt instanceof Date
                      ? playback.updatedAt
                      : new Date(String(playback.updatedAt ?? Date.now())),
                }
              : null,
          ),
          update: roomPlaybackUpdate,
        },
        queueItem: {
          findFirst: queueItemFindFirst,
          count: queueItemCount,
          create: queueItemCreate,
          findMany: queueItemFindMany,
          delete: queueItemDelete,
        },
        queueVote: { deleteMany: queueVoteDeleteMany },
        message: { create: messageCreate },
      },
    };

    const guestsService = {
      ensureGuest: jest.fn().mockResolvedValue({
        id: 'user-1',
        displayName: 'Ada',
        username: 'ada',
        avatarUrl: null,
        isGuest: true,
      }),
    };

    const presence = {
      getListenerCount: jest.fn().mockReturnValue(2),
      getLiveUserIds: jest.fn().mockReturnValue(['user-1', 'user-2']),
      getPresenceSnapshot: jest.fn().mockReturnValue({
        listenerCount: 2,
        liveUserIds: ['user-1', 'user-2'],
        liveParticipants: [
          { userId: 'user-1', displayName: 'Ada' },
          { userId: 'user-2', displayName: 'Bob' },
        ],
      }),
      resetAll: jest.fn(),
    };

    const service = new RoomsService(
      roomsRepository as never,
      guestsService as never,
      { saveVoiceFile: jest.fn() } as never,
      presence as never,
    );

    return {
      service,
      roomsRepository,
      presence,
      roomPlaybackUpdate,
      queueItemCreate,
      getSnapshot,
    };
  }

  it('listPublicRooms uses live presence count, not memberCount', async () => {
    const { service, presence } = buildService({
      playback: { youtubeVideoId: 'abc1234' },
    });
    const rooms = await service.listPublicRooms();
    expect(presence.getListenerCount).toHaveBeenCalledWith('room-1');
    expect(rooms[0].listenerCount).toBe(2);
    expect(rooms[0].memberCount).toBe(3);
    expect(rooms[0].playback?.youtubeVideoId).toBe('abc1234');
  });

  it('addToQueue starts playback when current track is stale/inactive', async () => {
    const started = Date.now() - 400_000;
    const { service, roomPlaybackUpdate, queueItemCreate } = buildService({
      playback: {
        youtubeVideoId: 'dead-video',
        isPlaying: true,
        positionMs: 0,
        durationMs: 180_000,
        updatedAt: new Date(started),
      },
    });

    expect(
      isPlaybackInactive({
        youtubeVideoId: 'dead-video',
        isPlaying: true,
        positionMs: 0,
        durationMs: 180_000,
        updatedAt: new Date(started),
      }),
    ).toBe(true);

    await service.addToQueue(
      'room-1',
      { guestId: 'guest_aaaaaaaa', displayName: 'Ada' },
      {
        youtubeVideoId: 'fresh123',
        title: 'Fresh',
        artist: 'Artist',
        durationMs: 200_000,
      },
    );

    expect(roomPlaybackUpdate).toHaveBeenCalled();
    expect(queueItemCreate).not.toHaveBeenCalled();
    const data = roomPlaybackUpdate.mock.calls[0][0].data;
    expect(data.youtubeVideoId).toBe('fresh123');
    expect(data.isPlaying).toBe(true);
  });

  it('recoverPlaybackIfNeeded advances once when queue has songs', async () => {
    const started = Date.now() - 400_000;
    const { service, roomPlaybackUpdate, getSnapshot } = buildService({
      playback: {
        youtubeVideoId: 'dead-video',
        isPlaying: true,
        positionMs: 0,
        durationMs: 180_000,
        updatedAt: new Date(started),
      },
      queueCount: 1,
      queueItems: [
        {
          id: 'qi-1',
          youtubeVideoId: 'next-vid',
          title: 'Next',
          artist: 'A',
          album: 'YouTube',
          durationMs: 200_000,
          addedById: 'user-2',
          addedAt: new Date(),
          votes: [],
          addedBy: { displayName: 'Bob' },
        },
      ],
    });

    const result = await service.recoverPlaybackIfNeeded('room-1', 'user-1');
    expect(result.recovered).toBe(true);
    expect(roomPlaybackUpdate).toHaveBeenCalled();
  });

  it('advancePlayback is idempotent for a failed ending video id', async () => {
    const { service, roomPlaybackUpdate } = buildService({
      playback: {
        youtubeVideoId: 'video-B',
        isPlaying: true,
        positionMs: 0,
        durationMs: 180_000,
        updatedAt: new Date(),
      },
    });

    const result = await service.advancePlayback(
      'room-1',
      { guestId: 'guest_aaaaaaaa', displayName: 'Ada' },
      'video-A',
    );

    expect(result.advanced).toBe(false);
    expect(roomPlaybackUpdate).not.toHaveBeenCalled();
  });
});
