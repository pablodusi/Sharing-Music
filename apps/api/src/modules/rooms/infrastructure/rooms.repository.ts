import { Injectable } from '@nestjs/common';
import { MessageType, RoomRole } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CreateRoomDto } from '../application/dto/create-room.dto';
import { sortQueueByVotesThenAddedAt } from '../domain/queue-rules';

const generateInviteCode = customAlphabet(
  '23456789ABCDEFGHJKLMNPQRSTUVWXYZ',
  8,
);

const userSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  isGuest: true,
  guestKey: true,
} as const;

@Injectable()
export class RoomsRepository {
  constructor(private readonly prisma: PrismaService) {}

  get prismaClient() {
    return this.prisma;
  }

  async create(ownerId: string, dto: CreateRoomDto) {
    const isPrivate = dto.isPrivate ?? false;

    return this.prisma.$transaction(async (tx) => {
      const room = await tx.room.create({
        data: {
          name: dto.name,
          description: dto.description,
          isPrivate,
          inviteCode: isPrivate ? generateInviteCode() : null,
          ownerId,
          members: {
            create: {
              userId: ownerId,
              role: RoomRole.OWNER,
            },
          },
          playback: {
            create: {},
          },
          messages: {
            create: {
              authorId: ownerId,
              type: MessageType.SYSTEM,
              content: 'Room created. Search for a song to start playback.',
            },
          },
        },
      });

      return room;
    });
  }

  async listPublic(limit = 20) {
    const rooms = await this.prisma.room.findMany({
      where: { isPrivate: false },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        _count: { select: { members: true } },
        playback: { include: { addedBy: { select: userSelect } } },
      },
    });

    return rooms.map(({ _count, playback, ...room }) => ({
      ...room,
      /** Historical membership size — not live listeners. */
      memberCount: _count.members,
      sharePath: `/rooms/${room.id}`,
      playback: playback
        ? {
            youtubeVideoId: playback.youtubeVideoId,
            trackTitle: playback.trackTitle,
            trackArtist: playback.trackArtist,
            trackAlbum: playback.trackAlbum,
            durationMs: playback.durationMs,
            positionMs: playback.positionMs,
            isPlaying: playback.isPlaying,
            updatedAt: playback.updatedAt,
            addedBy: playback.addedBy,
          }
        : null,
    }));
  }

  async findById(roomId: string) {
    return this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        members: { include: { user: { select: userSelect } } },
        playback: { include: { addedBy: { select: userSelect } } },
      },
    });
  }

  async isMember(roomId: string, userId: string): Promise<boolean> {
    const membership = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    return membership !== null;
  }

  async ensureMembership(
    roomId: string,
    userId: string,
    role: RoomRole = RoomRole.LISTENER,
  ) {
    return this.prisma.roomMember.upsert({
      where: { roomId_userId: { roomId, userId } },
      update: {},
      create: { roomId, userId, role },
      include: { user: { select: userSelect } },
    });
  }

  async getSnapshot(roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        members: {
          orderBy: { joinedAt: 'asc' },
          include: { user: { select: userSelect } },
        },
        playback: { include: { addedBy: { select: userSelect } } },
        queue: {
          include: {
            addedBy: { select: userSelect },
            votes: true,
          },
        },
        votes: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 200,
          include: { author: { select: userSelect } },
        },
      },
    });

    if (!room) {
      return null;
    }

    const queueSorted = sortQueueByVotesThenAddedAt(
      room.queue.map((item) => ({
        id: item.id,
        youtubeVideoId: item.youtubeVideoId,
        title: item.title,
        artist: item.artist,
        album: item.album,
        durationMs: item.durationMs,
        addedAt: item.addedAt,
        addedBy: item.addedBy,
        votes: item.votes.length,
        voteCount: item.votes.length,
      })),
    );

    const queue = queueSorted.map((item) => ({
      ...item,
      addedAt: item.addedAt.toISOString(),
    }));

    return {
      id: room.id,
      name: room.name,
      description: room.description,
      isPrivate: room.isPrivate,
      inviteCode: room.inviteCode,
      sharePath: `/rooms/${room.id}`,
      shareUrlPath: `/rooms/${room.id}`,
      ownerId: room.ownerId,
      createdAt: room.createdAt,
      members: room.members.map((m) => ({
        id: m.id,
        role: m.role,
        joinedAt: m.joinedAt,
        user: m.user,
      })),
      playback: room.playback
        ? {
            youtubeVideoId: room.playback.youtubeVideoId,
            trackTitle: room.playback.trackTitle,
            trackArtist: room.playback.trackArtist,
            trackAlbum: room.playback.trackAlbum,
            durationMs: room.playback.durationMs,
            positionMs: room.playback.positionMs,
            isPlaying: room.playback.isPlaying,
            updatedAt: room.playback.updatedAt,
            addedBy: room.playback.addedBy,
          }
        : null,
      queue,
      votesByUser: Object.fromEntries(
        room.votes.map((v) => [v.voterId, v.queueItemId]),
      ),
      messages: room.messages.map((m) => ({
        id: m.id,
        type: m.type,
        content: m.content,
        audioUrl: m.audioUrl,
        audioDurationMs: m.audioDurationMs,
        createdAt: m.createdAt,
        author: m.author,
      })),
    };
  }
}
