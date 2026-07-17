import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;
  private publisher!: Redis;
  private subscriber!: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const redisUrl = this.configService.getOrThrow<string>('REDIS_URL');

    this.client = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.publisher = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.subscriber = new Redis(redisUrl, { maxRetriesPerRequest: null });

    this.client.on('error', (error) => {
      this.logger.error('Redis client error', error);
    });
  }

  async onModuleDestroy() {
    await Promise.all([
      this.client.quit(),
      this.publisher.quit(),
      this.subscriber.quit(),
    ]);
  }

  getClient() {
    return this.client;
  }

  getPublisher() {
    return this.publisher;
  }

  getSubscriber() {
    return this.subscriber;
  }

  roomChannel(roomId: string) {
    return `room:${roomId}:events`;
  }
}
