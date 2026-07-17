import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/database/prisma.service';
import { RedisService } from '../src/infrastructure/redis/redis.service';

process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.DATABASE_URL =
  'postgresql://sharing_music:sharing_music@localhost:5432/sharing_music?schema=public';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.AUTH0_DOMAIN = 'test.auth0.com';
process.env.AUTH0_AUDIENCE = 'https://api.sharing-music.local';
process.env.AUTH0_ISSUER_URL = 'https://test.auth0.com/';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      })
      .overrideProvider(RedisService)
      .useValue({
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
        getClient: jest.fn().mockReturnValue({
          ping: jest.fn().mockResolvedValue('PONG'),
        }),
        getPublisher: jest.fn(),
        getSubscriber: jest.fn(),
        roomChannel: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('ok');
      });
  });
});
