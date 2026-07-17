import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RoomsService } from './rooms.service';
import { RoomsRepository } from '../infrastructure/rooms.repository';
import { GuestsService } from '../../guests/guests.service';
import { VoiceStorageService } from '../infrastructure/voice-storage.service';
import { RoomPresenceService } from '../../realtime/application/room-presence.service';

describe('RoomsService', () => {
  let service: RoomsService;
  let roomsRepository: jest.Mocked<RoomsRepository>;
  let guestsService: jest.Mocked<GuestsService>;

  beforeEach(async () => {
    roomsRepository = {
      create: jest.fn(),
      listPublic: jest.fn(),
      findById: jest.fn(),
      isMember: jest.fn(),
      ensureMembership: jest.fn(),
      getSnapshot: jest.fn(),
      prismaClient: {
        message: { create: jest.fn() },
        roomPlayback: { findUnique: jest.fn().mockResolvedValue(null) },
        queueItem: { count: jest.fn().mockResolvedValue(0) },
      },
    } as unknown as jest.Mocked<RoomsRepository>;

    guestsService = {
      ensureGuest: jest.fn(),
    } as unknown as jest.Mocked<GuestsService>;

    const voiceStorage = {
      saveVoiceFile: jest.fn(),
    } as unknown as VoiceStorageService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsService,
        RoomPresenceService,
        { provide: RoomsRepository, useValue: roomsRepository },
        { provide: GuestsService, useValue: guestsService },
        { provide: VoiceStorageService, useValue: voiceStorage },
      ],
    }).compile();

    service = module.get(RoomsService);
  });

  it('throws when room does not exist', async () => {
    roomsRepository.findById.mockResolvedValue(null);

    await expect(
      service.getSnapshot('missing', {
        guestId: 'guest_abcdefgh',
        displayName: 'Ada',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates a RoomMember when a guest joins a public room', async () => {
    roomsRepository.findById.mockResolvedValue({
      id: 'room-1',
      isPrivate: false,
      ownerId: 'owner-1',
    } as never);
    guestsService.ensureGuest.mockResolvedValue({
      id: 'user-2',
      displayName: 'Bob',
      username: 'guest_bob',
      avatarUrl: null,
      isGuest: true,
    } as never);
    roomsRepository.isMember.mockResolvedValue(false);
    roomsRepository.ensureMembership.mockResolvedValue({} as never);
    roomsRepository.getSnapshot.mockResolvedValue({ id: 'room-1' } as never);
    (roomsRepository.prismaClient.message.create as jest.Mock).mockResolvedValue(
      {},
    );

    const result = await service.joinRoom('room-1', {
      guestId: 'guest_bobbbbbbb',
      displayName: 'Bob',
    });

    expect(roomsRepository.ensureMembership).toHaveBeenCalledWith(
      'room-1',
      'user-2',
      expect.anything(),
    );
    expect(result.isNewMember).toBe(true);
    expect(result.snapshot).toMatchObject({
      id: 'room-1',
      listenerCount: 0,
      liveUserIds: [],
    });
  });

  it('forbids private snapshot without membership', async () => {
    roomsRepository.findById.mockResolvedValue({
      id: 'room-1',
      isPrivate: true,
    } as never);
    guestsService.ensureGuest.mockResolvedValue({ id: 'user-2' } as never);
    roomsRepository.isMember.mockResolvedValue(false);

    await expect(
      service.getSnapshot('room-1', {
        guestId: 'guest_cccccccc',
        displayName: 'Cara',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
