import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import {
  PlaybackState,
  RoomRealtimeEvent,
  UpdatePlaybackCommand,
} from '../domain/realtime.types';

@Injectable()
export class RoomSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getPlaybackState(roomId: string): Promise<PlaybackState | null> {
    const playback = await this.prisma.roomPlayback.findUnique({
      where: { roomId },
    });

    if (!playback) {
      return null;
    }

    return this.toState(playback);
  }

  async updatePlayback(
    roomId: string,
    command: UpdatePlaybackCommand,
  ): Promise<PlaybackState> {
    const playback = await this.prisma.roomPlayback.update({
      where: { roomId },
      data: command,
    });

    const state = this.toState(playback);

    await this.publish(roomId, {
      type: 'playback.updated',
      roomId,
      payload: state,
      emittedAt: new Date().toISOString(),
    });

    return state;
  }

  async publish(roomId: string, event: RoomRealtimeEvent): Promise<void> {
    await this.redis
      .getPublisher()
      .publish(this.redis.roomChannel(roomId), JSON.stringify(event));
  }

  subscribe(roomId: string, handler: (event: RoomRealtimeEvent) => void) {
    const channel = this.redis.roomChannel(roomId);
    const subscriber = this.redis.getSubscriber();

    const onMessage = (receivedChannel: string, message: string) => {
      if (receivedChannel !== channel) {
        return;
      }

      handler(JSON.parse(message) as RoomRealtimeEvent);
    };

    void subscriber.subscribe(channel);
    subscriber.on('message', onMessage);

    return () => {
      subscriber.off('message', onMessage);
      void subscriber.unsubscribe(channel);
    };
  }

  private toState(playback: {
    youtubeVideoId: string | null;
    trackTitle: string | null;
    trackArtist: string | null;
    trackAlbum: string | null;
    durationMs: number | null;
    positionMs: number;
    isPlaying: boolean;
    updatedAt: Date;
  }): PlaybackState {
    return {
      youtubeVideoId: playback.youtubeVideoId,
      trackTitle: playback.trackTitle,
      trackArtist: playback.trackArtist,
      trackAlbum: playback.trackAlbum,
      durationMs: playback.durationMs,
      positionMs: playback.positionMs,
      isPlaying: playback.isPlaying,
      updatedAt: playback.updatedAt.toISOString(),
    };
  }
}
