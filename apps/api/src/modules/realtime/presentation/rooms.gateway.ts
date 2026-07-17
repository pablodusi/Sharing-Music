import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  Logger,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { GuestIdentity } from '../../../common/types/guest-identity.type';
import { RoomsService } from '../../rooms/application/rooms.service';
import { RoomBroadcastService } from '../application/room-broadcast.service';
import { RoomPresenceService } from '../application/room-presence.service';

class GuestJoinPayload {
  @IsString()
  roomId!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  guestId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  displayName?: string;
}

class RoomOnlyPayload {
  @IsString()
  roomId!: string;
}

class QueueAddPayload {
  @IsString()
  roomId!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(32)
  youtubeVideoId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  artist!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  album?: string;

  @IsInt()
  @Min(1_000)
  @Max(600_000)
  durationMs!: number;
}

class QueueRemovePayload {
  @IsString()
  roomId!: string;

  @IsString()
  queueItemId!: string;
}

class VotePayload {
  @IsString()
  roomId!: string;

  @IsString()
  queueItemId!: string;
}

class ChatPayload {
  @IsString()
  roomId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content!: string;
}

class AdvancePayload {
  @IsString()
  roomId!: string;

  @IsOptional()
  @IsString()
  endingYoutubeVideoId?: string;
}

type SocketPresence = {
  userId: string;
  roomId: string;
  displayName: string;
};

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  },
})
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
)
export class RoomsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RoomsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly roomsService: RoomsService,
    private readonly broadcast: RoomBroadcastService,
    private readonly presence: RoomPresenceService,
  ) {}

  afterInit(server: Server) {
    this.broadcast.attachServer(server);
  }

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);

    // Fire while the socket is still in Socket.IO rooms so remaining peers
    // reliably receive member.left / presence.updated without a refresh.
    client.on('disconnecting', () => {
      void this.handleSocketLeaving(client);
    });
  }

  async handleDisconnect(client: Socket) {
    // Fallback if disconnecting did not run (some adapters).
    await this.handleSocketLeaving(client);
  }

  private async handleSocketLeaving(client: Socket) {
    const data = client.data as SocketPresence & {
      presenceCleared?: boolean;
    };
    if (!data?.roomId || !data?.userId || data.presenceCleared) {
      return;
    }
    data.presenceCleared = true;

    const { leftFully, listenerCount } = this.presence.remove(
      data.roomId,
      data.userId,
      client.id,
    );

    if (leftFully) {
      await this.broadcast.broadcast(data.roomId, 'member.left', {
        userId: data.userId,
        displayName: data.displayName,
        listenerCount,
      });
    }

    await this.broadcastPresence(data.roomId);
  }

  @SubscribeMessage('room.join')
  async joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: GuestJoinPayload,
  ) {
    const guest = this.toGuest(payload);
    const { snapshot, isNewMember, member } = await this.roomsService.joinRoom(
      payload.roomId,
      guest,
    );

    client.data.userId = member.userId;
    client.data.roomId = payload.roomId;
    client.data.displayName = member.displayName;
    client.data.guestKey = payload.guestId;
    await client.join(payload.roomId);
    const { listenerCount, becameOnline } = this.presence.add(
      payload.roomId,
      member.userId,
      client.id,
      {
        displayName: member.displayName,
        role: String(member.role),
      },
    );

    // Snapshot after presence so listenerCount reflects this socket.
    const presenceSnap = this.presence.getPresenceSnapshot(payload.roomId);
    const liveSnapshot = {
      ...snapshot,
      listenerCount: presenceSnap.listenerCount,
      liveUserIds: presenceSnap.liveUserIds,
      liveParticipants: presenceSnap.liveParticipants,
    };

    client.emit('room.joined', {
      roomId: payload.roomId,
      member,
      isNewMember,
    });
    client.emit('room.snapshot', liveSnapshot);

    if (isNewMember) {
      await this.broadcast.broadcast(payload.roomId, 'member.joined', {
        member,
        snapshot: liveSnapshot,
      });
    }

    // Always notify peers when someone becomes live (including returning members).
    if (becameOnline) {
      await this.broadcastPresence(payload.roomId);
    }

    return { roomId: payload.roomId, snapshot: liveSnapshot };
  }

  /** Reconnect / resync: fresh snapshot from DB. */
  @SubscribeMessage('room.sync')
  async syncRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RoomOnlyPayload,
  ) {
    const guest = this.requireGuest(client);
    const snapshot = await this.roomsService.getSnapshot(payload.roomId, guest);
    if (!snapshot) {
      throw new UnauthorizedException('Room not found');
    }
    client.emit('room.snapshot', snapshot);
    return snapshot;
  }

  @SubscribeMessage('queue.add')
  async addToQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: QueueAddPayload,
  ) {
    const guest = this.requireGuest(client);
    this.assertSameRoom(client, payload.roomId);

    const snapshot = await this.requireSnapshot(
      this.roomsService.addToQueue(payload.roomId, guest, {
        youtubeVideoId: payload.youtubeVideoId,
        title: payload.title,
        artist: payload.artist,
        album: payload.album,
        durationMs: payload.durationMs,
      }),
    );

    await this.broadcast.broadcast(payload.roomId, 'queue.updated', {
      queue: snapshot.queue,
      playback: snapshot.playback,
      messages: snapshot.messages,
    });
    await this.broadcast.broadcast(payload.roomId, 'playback.updated', {
      playback: snapshot.playback,
    });

    return snapshot;
  }

  @SubscribeMessage('queue.remove')
  async removeFromQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: QueueRemovePayload,
  ) {
    const guest = this.requireGuest(client);
    this.assertSameRoom(client, payload.roomId);

    const snapshot = await this.requireSnapshot(
      this.roomsService.removeFromQueue(
        payload.roomId,
        payload.queueItemId,
        guest,
      ),
    );

    await this.broadcast.broadcast(payload.roomId, 'queue.updated', {
      queue: snapshot.queue,
      messages: snapshot.messages,
    });

    return snapshot;
  }

  @SubscribeMessage('vote.cast')
  async castVote(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: VotePayload,
  ) {
    const guest = this.requireGuest(client);
    this.assertSameRoom(client, payload.roomId);

    const snapshot = await this.requireSnapshot(
      this.roomsService.castVote(payload.roomId, guest, payload.queueItemId),
    );

    await this.broadcast.broadcast(payload.roomId, 'vote.updated', {
      queue: snapshot.queue,
      votesByUser: snapshot.votesByUser,
      messages: snapshot.messages,
    });
    await this.broadcast.broadcast(payload.roomId, 'queue.updated', {
      queue: snapshot.queue,
      messages: snapshot.messages,
    });

    return snapshot;
  }

  @SubscribeMessage('chat.send')
  async sendChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChatPayload,
  ) {
    const guest = this.requireGuest(client);
    this.assertSameRoom(client, payload.roomId);

    const snapshot = await this.requireSnapshot(
      this.roomsService.sendTextMessage(
        payload.roomId,
        guest,
        payload.content,
      ),
    );

    const lastMessage = snapshot.messages[snapshot.messages.length - 1];
    await this.broadcast.broadcast(payload.roomId, 'chat.message', lastMessage);

    return snapshot;
  }

  @SubscribeMessage('playback.advance')
  async advancePlayback(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: AdvancePayload,
  ) {
    const guest = this.requireGuest(client);
    this.assertSameRoom(client, payload.roomId);

    const { snapshot, advanced } = await this.roomsService.advancePlayback(
      payload.roomId,
      guest,
      payload.endingYoutubeVideoId,
    );

    if (!snapshot) {
      throw new UnauthorizedException('Room not found');
    }

    if (advanced) {
      await this.broadcast.broadcast(payload.roomId, 'playback.advanced', {
        playback: snapshot.playback,
        queue: snapshot.queue,
        votesByUser: snapshot.votesByUser,
        messages: snapshot.messages,
      });
      await this.broadcast.broadcast(payload.roomId, 'playback.updated', {
        playback: snapshot.playback,
      });
      await this.broadcast.broadcast(payload.roomId, 'queue.updated', {
        queue: snapshot.queue,
        messages: snapshot.messages,
      });
    }

    return { snapshot, advanced };
  }

  private async requireSnapshot<T>(promise: Promise<T | null>): Promise<T> {
    const snapshot = await promise;
    if (!snapshot) {
      throw new UnauthorizedException('Room not found');
    }
    return snapshot;
  }

  private toGuest(payload: {
    guestId: string;
    displayName?: string;
  }): GuestIdentity {
    const guest = new GuestIdentity();
    guest.guestId = payload.guestId;
    guest.displayName = (payload.displayName ?? 'Guest').trim().slice(0, 32) || 'Guest';
    return guest;
  }

  private requireGuest(client: Socket): GuestIdentity {
    const userId = client.data.userId as string | undefined;
    const displayName = (client.data.displayName as string | undefined) ?? 'Guest';
    if (!userId || !client.data.roomId) {
      throw new UnauthorizedException('Join the room before sending events');
    }

    // RoomsService resolves membership via guestKey; store guestKey on join.
    const guestKey = client.data.guestKey as string | undefined;
    if (!guestKey) {
      throw new UnauthorizedException('Missing guest identity on socket');
    }

    const guest = new GuestIdentity();
    guest.guestId = guestKey;
    guest.displayName = displayName;
    return guest;
  }

  private assertSameRoom(client: Socket, roomId: string) {
    if (client.data.roomId !== roomId) {
      throw new UnauthorizedException('Socket is not joined to this room');
    }
  }

  private async broadcastPresence(roomId: string) {
    const snapshot = this.presence.getPresenceSnapshot(roomId);
    await this.broadcast.broadcast(roomId, 'presence.updated', snapshot);
  }
}
