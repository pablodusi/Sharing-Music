import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { io, Socket } from 'socket.io-client';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { RoomsService } from '../rooms/application/rooms.service';
import { RoomBroadcastService } from './application/room-broadcast.service';
import { RoomsGateway } from './presentation/rooms.gateway';
import { RoomPresenceService } from './application/room-presence.service';

type Snapshot = {
  id: string;
  queue: Array<{ id: string; title: string; votes: number }>;
  votesByUser: Record<string, string>;
  messages: Array<{ id: string; content: string; type: string }>;
  playback: { youtubeVideoId: string | null; trackTitle: string | null };
  members: Array<{ user: { id: string; displayName: string } }>;
};

function once<T>(socket: Socket, event: string, timeoutMs = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for ${event}`)),
      timeoutMs,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function emitAck(socket: Socket, event: string, payload: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Ack timeout: ${event}`)), 4000);
    socket.emit(event, payload, (ack: unknown) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

describe('RoomsGateway realtime (two clients)', () => {
  let app: INestApplication;
  let url: string;
  let state: Snapshot;

  const roomsService = {
    joinRoom: jest.fn(),
    getSnapshot: jest.fn(),
    addToQueue: jest.fn(),
    castVote: jest.fn(),
    sendTextMessage: jest.fn(),
    advancePlayback: jest.fn(),
  };

  beforeAll(async () => {
    state = {
      id: 'room-1',
      queue: [],
      votesByUser: {},
      messages: [],
      playback: { youtubeVideoId: null, trackTitle: null },
      members: [],
    };

    roomsService.joinRoom.mockImplementation(
      async (_roomId: string, guest: { guestId: string; displayName: string }) => {
        const userId = `user-${guest.guestId}`;
        const member = {
          userId,
          displayName: guest.displayName,
          username: guest.guestId,
          avatarUrl: null,
          isGuest: true,
          role: 'LISTENER',
        };
        const isNewMember = !state.members.some((m) => m.user.id === userId);
        if (isNewMember) {
          state.members.push({
            user: { id: userId, displayName: guest.displayName },
          });
        }
        return { snapshot: structuredClone(state), isNewMember, member };
      },
    );

    roomsService.getSnapshot.mockImplementation(async () => structuredClone(state));

    roomsService.addToQueue.mockImplementation(async () => {
      state.playback = { youtubeVideoId: 'abc1234', trackTitle: 'Song A' };
      return structuredClone(state);
    });

    roomsService.castVote.mockImplementation(async () => {
      state.queue = [{ id: 'q1', title: 'Song B', votes: 1 }];
      state.votesByUser = { 'user-guest_bbbbbbbb': 'q1' };
      return structuredClone(state);
    });

    roomsService.sendTextMessage.mockImplementation(
      async (_r, _g, content: string) => {
        state.messages.push({
          id: `msg-${state.messages.length + 1}`,
          content,
          type: 'TEXT',
        });
        return structuredClone(state);
      },
    );

    roomsService.advancePlayback.mockImplementation(async () => {
      state.playback = { youtubeVideoId: 'xyz9876', trackTitle: 'Song B' };
      state.queue = [];
      return { snapshot: structuredClone(state), advanced: true };
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsGateway,
        RoomBroadcastService,
        RoomPresenceService,
        { provide: RoomsService, useValue: roomsService },
        {
          provide: RedisService,
          useValue: {
            getPublisher: () => ({ publish: jest.fn().mockResolvedValue(1) }),
            roomChannel: (roomId: string) => `room:${roomId}:events`,
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 0;
    url = `http://127.0.0.1:${port}/realtime`;
  });

  afterAll(async () => {
    await app.close();
  });

  async function connectGuest(
    guestId: string,
    displayName: string,
  ): Promise<Socket> {
    const socket = io(url, { transports: ['websocket'], forceNew: true });
    await once(socket, 'connect');
    const joined = once(socket, 'room.joined');
    const snapshot = once(socket, 'room.snapshot');
    await emitAck(socket, 'room.join', {
      roomId: 'room-1',
      guestId,
      displayName,
    });
    await Promise.all([joined, snapshot]);
    return socket;
  }

  it('delivers the same updates to two guests in one room', async () => {
    const alice = await connectGuest('guest_aaaaaaaa', 'Ada');

    const aliceSeesBob = once<{ member: { displayName: string } }>(
      alice,
      'member.joined',
    );
    const bob = await connectGuest('guest_bbbbbbbb', 'Bob');
    const bobJoin = await aliceSeesBob;
    expect(bobJoin.member.displayName).toBe('Bob');

    const aliceQueue = once<{ playback: Snapshot['playback'] }>(
      alice,
      'queue.updated',
    );
    const bobQueue = once<{ playback: Snapshot['playback'] }>(bob, 'queue.updated');
    await emitAck(alice, 'queue.add', {
      roomId: 'room-1',
      youtubeVideoId: 'abc1234',
      title: 'Song A',
      artist: 'Artist',
      durationMs: 180_000,
    });
    const [aq, bq] = await Promise.all([aliceQueue, bobQueue]);
    expect(aq.playback?.trackTitle).toBe('Song A');
    expect(bq.playback?.trackTitle).toBe('Song A');

    state.queue = [{ id: 'q1', title: 'Song B', votes: 0 }];

    const aliceVote = once<{ votesByUser: Record<string, string> }>(
      alice,
      'vote.updated',
    );
    await emitAck(bob, 'vote.cast', { roomId: 'room-1', queueItemId: 'q1' });
    const vote = await aliceVote;
    expect(vote.votesByUser['user-guest_bbbbbbbb']).toBe('q1');

    const aliceChat = once<{ content: string }>(alice, 'chat.message');
    const bobChat = once<{ content: string }>(bob, 'chat.message');
    await emitAck(bob, 'chat.send', {
      roomId: 'room-1',
      content: 'Hello room',
    });
    const [ac, bc] = await Promise.all([aliceChat, bobChat]);
    expect(ac.content).toBe('Hello room');
    expect(bc.content).toBe('Hello room');

    const aliceAdv = once<{ playback: Snapshot['playback'] }>(
      alice,
      'playback.advanced',
    );
    const bobAdv = once<{ playback: Snapshot['playback'] }>(
      bob,
      'playback.advanced',
    );
    await emitAck(alice, 'playback.advance', {
      roomId: 'room-1',
      endingYoutubeVideoId: 'abc1234',
    });
    const [aa, ba] = await Promise.all([aliceAdv, bobAdv]);
    expect(aa.playback?.trackTitle).toBe('Song B');
    expect(ba.playback?.trackTitle).toBe('Song B');

    const synced = once<Snapshot>(bob, 'room.snapshot');
    bob.emit('room.sync', { roomId: 'room-1' });
    const snap = await synced;
    expect(snap.playback?.trackTitle).toBe('Song B');

    alice.disconnect();
    bob.disconnect();
  }, 20_000);
});
