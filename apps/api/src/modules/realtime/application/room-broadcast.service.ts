import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { RoomRealtimeEventType } from '../domain/realtime.types';

/**
 * Persist-then-broadcast helper.
 * Emits on the local Socket.IO server and publishes to Redis for multi-instance prep.
 */
@Injectable()
export class RoomBroadcastService {
  private readonly logger = new Logger(RoomBroadcastService.name);
  private server: Server | null = null;

  constructor(private readonly redis: RedisService) {}

  attachServer(server: Server) {
    this.server = server;
  }

  async broadcast(
    roomId: string,
    type: RoomRealtimeEventType,
    payload: unknown,
  ): Promise<void> {
    const event = {
      type,
      roomId,
      payload,
      emittedAt: new Date().toISOString(),
    };

    this.server?.to(roomId).emit(type, payload);

    try {
      await this.redis
        .getPublisher()
        .publish(this.redis.roomChannel(roomId), JSON.stringify(event));
    } catch (error) {
      this.logger.warn(
        `Redis publish failed for ${type} in ${roomId}: ${(error as Error).message}`,
      );
    }
  }

  emitToClient(clientId: string, type: RoomRealtimeEventType, payload: unknown) {
    this.server?.to(clientId).emit(type, payload);
  }
}
