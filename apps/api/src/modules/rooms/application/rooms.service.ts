import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MessageType, RoomRole } from '@prisma/client';
import { GuestIdentity } from '../../../common/types/guest-identity.type';
import { GuestsService } from '../../guests/guests.service';
import { RoomPresenceService } from '../../realtime/application/room-presence.service';
import {
  canRemoveQueueItem,
  canVoteOnQueueItem,
  getAddBlockReason,
  sortQueueByVotesThenAddedAt,
} from '../domain/queue-rules';
import { isPlaybackInactive } from '../domain/playback-recovery';
import { CreateRoomDto } from './dto/create-room.dto';
import { AddQueueTrackDto } from './dto/room-actions.dto';
import { RoomsRepository } from '../infrastructure/rooms.repository';
import { VoiceStorageService } from '../infrastructure/voice-storage.service';

@Injectable()
export class RoomsService {
  constructor(
    private readonly roomsRepository: RoomsRepository,
    private readonly guestsService: GuestsService,
    private readonly voiceStorage: VoiceStorageService,
    private readonly presence: RoomPresenceService,
  ) {}

  async createRoom(guest: GuestIdentity, dto: CreateRoomDto) {
    const owner = await this.guestsService.ensureGuest(guest);
    const room = await this.roomsRepository.create(owner.id, dto);
    return this.getEnrichedSnapshot(room.id);
  }

  async listPublicRooms() {
    const rooms = await this.roomsRepository.listPublic();
    return rooms.map((room) => ({
      ...room,
      /** Live unique connected users — not RoomMember count. */
      listenerCount: this.presence.getListenerCount(room.id),
      updatedAt:
        room.updatedAt instanceof Date
          ? room.updatedAt.toISOString()
          : room.updatedAt,
      createdAt:
        room.createdAt instanceof Date
          ? room.createdAt.toISOString()
          : room.createdAt,
      playback: room.playback
        ? {
            ...room.playback,
            updatedAt:
              room.playback.updatedAt instanceof Date
                ? room.playback.updatedAt.toISOString()
                : room.playback.updatedAt,
          }
        : null,
    }));
  }

  async joinRoom(roomId: string, guest: GuestIdentity) {
    const room = await this.roomsRepository.findById(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const user = await this.guestsService.ensureGuest(guest);
    const wasMember = await this.roomsRepository.isMember(roomId, user.id);
    const isOwner = room.ownerId === user.id;

    await this.roomsRepository.ensureMembership(
      roomId,
      user.id,
      isOwner ? RoomRole.OWNER : RoomRole.LISTENER,
    );

    if (!wasMember) {
      await this.appendSystemMessage(
        roomId,
        user.id,
        `${user.displayName} joined the room.`,
      );
    }

    await this.recoverPlaybackIfNeeded(roomId, user.id);

    const snapshot = await this.getEnrichedSnapshot(roomId);
    return {
      snapshot,
      isNewMember: !wasMember,
      member: {
        userId: user.id,
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        isGuest: user.isGuest,
        role: isOwner ? RoomRole.OWNER : RoomRole.LISTENER,
      },
    };
  }

  async getSnapshot(roomId: string, guest?: GuestIdentity) {
    const room = await this.roomsRepository.findById(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (room.isPrivate && guest) {
      const user = await this.guestsService.ensureGuest(guest);
      const isMember = await this.roomsRepository.isMember(roomId, user.id);
      if (!isMember) {
        throw new ForbiddenException('Join the room before viewing it');
      }
      await this.recoverPlaybackIfNeeded(roomId, user.id);
    } else if (room.isPrivate && !guest) {
      throw new ForbiddenException('Private room requires guest identity');
    } else if (guest) {
      const user = await this.guestsService.ensureGuest(guest);
      await this.recoverPlaybackIfNeeded(roomId, user.id);
    } else {
      await this.recoverPlaybackIfNeeded(roomId, room.ownerId);
    }

    return this.getEnrichedSnapshot(roomId);
  }

  async addToQueue(roomId: string, guest: GuestIdentity, dto: AddQueueTrackDto) {
    const user = await this.requireMember(roomId, guest);
    const prisma = this.roomsRepository.prismaClient;

    const playback = await prisma.roomPlayback.findUnique({
      where: { roomId },
    });

    const duplicateInQueue = await prisma.queueItem.findFirst({
      where: { roomId, youtubeVideoId: dto.youtubeVideoId },
    });
    if (
      duplicateInQueue ||
      (playback?.youtubeVideoId === dto.youtubeVideoId &&
        !isPlaybackInactive(playback))
    ) {
      throw new BadRequestException('Track is already in this room');
    }

    // Empty or stale/failed Now playing → start immediately (unblocks black player).
    if (!playback?.youtubeVideoId || isPlaybackInactive(playback)) {
      await prisma.roomPlayback.update({
        where: { roomId },
        data: {
          youtubeVideoId: dto.youtubeVideoId,
          trackTitle: dto.title,
          trackArtist: dto.artist,
          trackAlbum: dto.album ?? 'YouTube',
          durationMs: dto.durationMs,
          addedById: user.id,
          positionMs: 0,
          isPlaying: true,
        },
      });

      await this.appendSystemMessage(
        roomId,
        user.id,
        `${user.displayName} started playing ${dto.title}.`,
      );

      return this.getEnrichedSnapshot(roomId);
    }

    const queuedByUser = await prisma.queueItem.count({
      where: { roomId, addedById: user.id },
    });

    const block = getAddBlockReason({
      userId: user.id,
      queuedByUser,
      nowPlayingAddedById: playback.addedById,
      nowPlayingTitle: playback.trackTitle,
    });

    if (block?.kind === 'queue_limit') {
      throw new BadRequestException(
        `Queue limit reached (${block.count}/${block.max}).`,
      );
    }
    if (block?.kind === 'playing') {
      throw new BadRequestException(
        `Your song “${block.title}” is playing. Wait until it finishes.`,
      );
    }

    await prisma.queueItem.create({
      data: {
        roomId,
        youtubeVideoId: dto.youtubeVideoId,
        title: dto.title,
        artist: dto.artist,
        album: dto.album ?? 'YouTube',
        durationMs: dto.durationMs,
        addedById: user.id,
      },
    });

    await this.appendSystemMessage(
      roomId,
      user.id,
      `${user.displayName} added ${dto.title} to Up Next.`,
    );

    return this.getEnrichedSnapshot(roomId);
  }

  async removeFromQueue(
    roomId: string,
    queueItemId: string,
    guest: GuestIdentity,
  ) {
    const user = await this.requireMember(roomId, guest);
    const prisma = this.roomsRepository.prismaClient;

    const item = await prisma.queueItem.findFirst({
      where: { id: queueItemId, roomId },
      include: { votes: true },
    });

    if (!item) {
      throw new NotFoundException('Queue item not found');
    }

    if (
      !canRemoveQueueItem({
        addedById: item.addedById,
        userId: user.id,
        voteCount: item.votes.length,
      })
    ) {
      throw new ForbiddenException(
        'You can only remove your own unvoted songs',
      );
    }

    await prisma.queueItem.delete({ where: { id: item.id } });

    await this.appendSystemMessage(
      roomId,
      user.id,
      `${user.displayName} removed ${item.title} from Up Next.`,
    );

    return this.getEnrichedSnapshot(roomId);
  }

  async castVote(
    roomId: string,
    guest: GuestIdentity,
    queueItemId: string,
  ) {
    const user = await this.requireMember(roomId, guest);
    const prisma = this.roomsRepository.prismaClient;

    const item = await prisma.queueItem.findFirst({
      where: { id: queueItemId, roomId },
    });
    if (!item) {
      throw new NotFoundException('Queue item not found');
    }

    if (
      !canVoteOnQueueItem({ addedById: item.addedById, voterId: user.id })
    ) {
      throw new ForbiddenException('You cannot vote for your own song');
    }

    const existing = await prisma.queueVote.findUnique({
      where: { roomId_voterId: { roomId, voterId: user.id } },
      include: { queueItem: true },
    });

    if (existing?.queueItemId === queueItemId) {
      return this.getEnrichedSnapshot(roomId);
    }

    await prisma.queueVote.upsert({
      where: { roomId_voterId: { roomId, voterId: user.id } },
      create: { roomId, voterId: user.id, queueItemId },
      update: { queueItemId },
    });

    if (!existing) {
      await this.appendSystemMessage(
        roomId,
        user.id,
        `${user.displayName} voted for ${item.title}.`,
      );
    } else {
      await this.appendSystemMessage(
        roomId,
        user.id,
        `${user.displayName} moved their vote from ${existing.queueItem.title} to ${item.title}.`,
      );
    }

    return this.getEnrichedSnapshot(roomId);
  }

  async sendTextMessage(
    roomId: string,
    guest: GuestIdentity,
    content: string,
  ) {
    const user = await this.requireMember(roomId, guest);
    const prisma = this.roomsRepository.prismaClient;

    await prisma.message.create({
      data: {
        roomId,
        authorId: user.id,
        type: MessageType.TEXT,
        content: content.trim(),
      },
    });

    return this.getEnrichedSnapshot(roomId);
  }

  async sendVoiceMessage(
    roomId: string,
    guest: GuestIdentity,
    file: Express.Multer.File,
    durationMs: number,
  ) {
    const user = await this.requireMember(roomId, guest);

    if (!file?.buffer?.length) {
      throw new BadRequestException('Voice file is required');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Voice file must be ≤ 5MB');
    }

    const saved = await this.voiceStorage.saveVoiceFile(file);
    const prisma = this.roomsRepository.prismaClient;

    await prisma.message.create({
      data: {
        roomId,
        authorId: user.id,
        type: MessageType.VOICE,
        content: 'Voice message',
        audioUrl: saved.audioUrl,
        audioDurationMs: durationMs,
      },
    });

    return this.getEnrichedSnapshot(roomId);
  }

  /**
   * When the current track ends or fails: pick next by votes then oldest addedAt.
   * Idempotent: pass `endingYoutubeVideoId` so a second client that also saw
   * ENDED/ERROR cannot skip an extra song after the first advance already won.
   */
  async advancePlayback(
    roomId: string,
    guest: GuestIdentity,
    endingYoutubeVideoId?: string | null,
  ) {
    const user = await this.requireMember(roomId, guest);
    const result = await this.runAdvanceTransaction(
      roomId,
      user.id,
      endingYoutubeVideoId,
    );

    const snapshot = await this.getEnrichedSnapshot(roomId);
    return {
      snapshot,
      advanced: result.advanced,
    };
  }

  /**
   * After restart / stuck state: if Now playing is inactive and the queue has
   * songs, promote the next track once. If inactive with empty queue, clear.
   */
  async recoverPlaybackIfNeeded(roomId: string, actorUserId: string) {
    const prisma = this.roomsRepository.prismaClient;
    const playback = await prisma.roomPlayback.findUnique({
      where: { roomId },
    });

    if (!playback?.youtubeVideoId || !isPlaybackInactive(playback)) {
      return { recovered: false };
    }

    const queueCount = await prisma.queueItem.count({ where: { roomId } });
    if (queueCount === 0) {
      if (!playback.youtubeVideoId) {
        return { recovered: false };
      }
      await prisma.roomPlayback.update({
        where: { roomId },
        data: {
          youtubeVideoId: null,
          trackTitle: null,
          trackArtist: null,
          trackAlbum: null,
          durationMs: null,
          addedById: null,
          positionMs: 0,
          isPlaying: false,
        },
      });
      return { recovered: true, cleared: true };
    }

    const result = await this.runAdvanceTransaction(
      roomId,
      actorUserId,
      playback.youtubeVideoId,
    );
    return { recovered: result.advanced, cleared: false };
  }

  private async runAdvanceTransaction(
    roomId: string,
    actorUserId: string,
    endingYoutubeVideoId?: string | null,
  ) {
    const prisma = this.roomsRepository.prismaClient;

    return prisma.$transaction(async (tx) => {
      const playbackRows = await tx.$queryRaw<
        Array<{ youtube_video_id: string | null }>
      >`
        SELECT youtube_video_id
        FROM room_playback
        WHERE room_id = ${roomId}
        FOR UPDATE
      `;

      const currentVideoId = playbackRows[0]?.youtube_video_id ?? null;

      if (
        endingYoutubeVideoId &&
        currentVideoId &&
        currentVideoId !== endingYoutubeVideoId
      ) {
        return { advanced: false as const };
      }

      if (endingYoutubeVideoId && !currentVideoId) {
        return { advanced: false as const };
      }

      const items = await tx.queueItem.findMany({
        where: { roomId },
        include: { votes: true, addedBy: true },
      });

      if (items.length === 0) {
        if (!currentVideoId) {
          return { advanced: false as const };
        }

        await tx.roomPlayback.update({
          where: { roomId },
          data: {
            youtubeVideoId: null,
            trackTitle: null,
            trackArtist: null,
            trackAlbum: null,
            durationMs: null,
            addedById: null,
            positionMs: 0,
            isPlaying: false,
          },
        });
        await tx.queueVote.deleteMany({ where: { roomId } });
        return { advanced: true as const, cleared: true as const };
      }

      const ranked = sortQueueByVotesThenAddedAt(
        items.map((item) => ({
          ...item,
          votes: item.votes.length,
        })),
      );
      const winner = ranked[0];

      await tx.queueVote.deleteMany({ where: { roomId } });
      await tx.queueItem.delete({ where: { id: winner.id } });
      await tx.roomPlayback.update({
        where: { roomId },
        data: {
          youtubeVideoId: winner.youtubeVideoId,
          trackTitle: winner.title,
          trackArtist: winner.artist,
          trackAlbum: winner.album,
          durationMs: winner.durationMs,
          addedById: winner.addedById,
          positionMs: 0,
          isPlaying: true,
        },
      });
      await tx.message.create({
        data: {
          roomId,
          authorId: actorUserId,
          type: MessageType.SYSTEM,
          content: `Now playing: ${winner.title}, added by ${winner.addedBy.displayName}.`,
        },
      });

      return {
        advanced: true as const,
        cleared: false as const,
        winnerTitle: winner.title,
      };
    });
  }

  private async getEnrichedSnapshot(roomId: string) {
    const snapshot = await this.roomsRepository.getSnapshot(roomId);
    if (!snapshot) {
      return null;
    }
    const presenceSnap = this.presence.getPresenceSnapshot(roomId);
    return {
      ...snapshot,
      listenerCount: presenceSnap.listenerCount,
      liveUserIds: presenceSnap.liveUserIds,
      liveParticipants: presenceSnap.liveParticipants,
      createdAt:
        snapshot.createdAt instanceof Date
          ? snapshot.createdAt.toISOString()
          : snapshot.createdAt,
      playback: snapshot.playback
        ? {
            ...snapshot.playback,
            updatedAt:
              snapshot.playback.updatedAt instanceof Date
                ? snapshot.playback.updatedAt.toISOString()
                : snapshot.playback.updatedAt,
          }
        : null,
    };
  }

  private async requireMember(roomId: string, guest: GuestIdentity) {
    const room = await this.roomsRepository.findById(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const user = await this.guestsService.ensureGuest(guest);
    const isMember = await this.roomsRepository.isMember(roomId, user.id);
    if (!isMember) {
      throw new ForbiddenException('Join the room before performing this action');
    }
    return user;
  }

  private async appendSystemMessage(
    roomId: string,
    authorId: string,
    content: string,
  ) {
    await this.roomsRepository.prismaClient.message.create({
      data: {
        roomId,
        authorId,
        type: MessageType.SYSTEM,
        content,
      },
    });
  }
}
