import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';

import { AuthService } from '../auth/auth.service';
import { MembershipService } from '../membership/membership.service';
import { RedisService } from '../redis/redis.service';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

class FakeSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  sent: Record<string, unknown>[] = [];
  closedWith?: { code: number; reason: string };
  subscriptions?: Set<string>;

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(code: number, reason: string): void {
    this.closedWith = { code, reason };
    this.readyState = WebSocket.CLOSED;
    this.emit('close');
  }

  receive(message: object): void {
    this.emit('message', Buffer.from(JSON.stringify(message)));
  }

  types(): unknown[] {
    return this.sent.map((m) => m.type);
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const flush = () => new Promise((r) => setImmediate(r));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const inAnHour = () => Date.now() + 60 * 60 * 1000;

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let authService: { verifyToken: jest.Mock };
  let membershipService: { assertMember: jest.Mock };
  let chatService: { getChannel: jest.Mock };
  let socket: FakeSocket;

  beforeEach(() => {
    authService = {
      verifyToken: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve({ userId: 'u1', expiresAt: inAnHour() }),
        ),
    };
    membershipService = {
      assertMember: jest.fn().mockResolvedValue(undefined),
    };
    chatService = {
      getChannel: jest.fn().mockResolvedValue({ orgId: 'org1' }),
    };

    gateway = new ChatGateway(
      authService as unknown as AuthService,
      membershipService as unknown as MembershipService,
      chatService as unknown as ChatService,
      {} as RedisService,
    );

    socket = new FakeSocket();
    gateway.handleConnection(socket as unknown as WebSocket);
  });

  afterEach(() => {
    if (socket.readyState === WebSocket.OPEN) socket.close(1000, 'done');
  });

  it('AUTH 응답을 기다리지 않고 SUBSCRIBE를 보내도 구독된다', async () => {
    const auth = deferred<{ userId: string; expiresAt: number }>();
    authService.verifyToken.mockReturnValue(auth.promise);

    socket.receive({ type: 'AUTH', token: 't' });
    socket.receive({ type: 'SUBSCRIBE', channelId: 'c1' });
    await flush();
    auth.resolve({ userId: 'u1', expiresAt: inAnHour() });
    await flush();

    expect(socket.closedWith).toBeUndefined();
    expect(socket.types()).toEqual(['AUTH_REQUIRED', 'AUTH_OK', 'SUBSCRIBED']);
    expect(socket.subscriptions?.has('c1')).toBe(true);
  });

  it('SUBSCRIBE 확인 중에 온 UNSUBSCRIBE가 마지막에 적용된다', async () => {
    socket.receive({ type: 'AUTH', token: 't' });
    await flush();

    const member = deferred<void>();
    membershipService.assertMember.mockReturnValue(member.promise);

    socket.receive({ type: 'SUBSCRIBE', channelId: 'c1' });
    socket.receive({ type: 'UNSUBSCRIBE', channelId: 'c1' });
    await flush();
    member.resolve();
    await flush();

    expect(socket.types().slice(-2)).toEqual(['SUBSCRIBED', 'UNSUBSCRIBED']);
    expect(socket.subscriptions?.has('c1')).toBe(false);
  });

  describe('handleMemberEvent', () => {
    const removed = (orgId: string, userId: string) =>
      JSON.stringify({ type: 'MEMBER_REMOVED', orgId, userId });

    beforeEach(async () => {
      socket.receive({ type: 'AUTH', token: 't' });
      socket.receive({ type: 'SUBSCRIBE', channelId: 'c1' });
      await flush();
    });

    it('그 조직 채널을 구독한 사용자의 연결을 끊는다', () => {
      gateway.handleMemberEvent(removed('org1', 'u1'));

      expect(socket.closedWith).toEqual({
        code: 1008,
        reason: 'Membership revoked',
      });
    });

    it.each([
      ['다른 조직', removed('org2', 'u1')],
      ['다른 사용자', removed('org1', 'u2')],
      ['형식이 틀림', JSON.stringify({ type: 'MEMBER_REMOVED', orgId: 1 })],
      ['JSON 아님', 'not-json'],
    ])('%s 이벤트는 연결을 유지한다', (_name, raw) => {
      expect(() => gateway.handleMemberEvent(raw)).not.toThrow();
      expect(socket.closedWith).toBeUndefined();
    });

    it('소속 확인 중이던 SUBSCRIBE는 알림 뒤에 붙지 않는다', async () => {
      const member = deferred<void>();
      membershipService.assertMember.mockReturnValue(member.promise);
      chatService.getChannel.mockResolvedValue({ orgId: 'org2' });

      socket.receive({ type: 'SUBSCRIBE', channelId: 'c2' });
      await flush();
      gateway.handleMemberEvent(removed('org2', 'u1'));
      expect(socket.closedWith).toBeUndefined();

      member.resolve();
      await flush();

      expect(socket.closedWith?.reason).toBe('Membership revoked');
      expect(socket.subscriptions?.has('c2')).toBe(false);
    });
  });

  describe('토큰 만료', () => {
    it('토큰이 만료되면 연결을 끊는다', async () => {
      authService.verifyToken.mockResolvedValue({
        userId: 'u1',
        expiresAt: Date.now() + 30,
      });

      socket.receive({ type: 'AUTH', token: 't' });
      await flush();
      expect(socket.closedWith).toBeUndefined();

      await sleep(60);

      expect(socket.closedWith).toEqual({
        code: 1008,
        reason: 'Token expired',
      });
    });

    it('새 토큰으로 AUTH를 다시 보내면 연장된다', async () => {
      authService.verifyToken.mockResolvedValueOnce({
        userId: 'u1',
        expiresAt: Date.now() + 30,
      });

      socket.receive({ type: 'AUTH', token: 'old' });
      await flush();
      socket.receive({ type: 'AUTH', token: 'new' });
      await flush();
      await sleep(60);

      expect(socket.closedWith).toBeUndefined();
      expect(socket.types()).toEqual(['AUTH_REQUIRED', 'AUTH_OK', 'AUTH_OK']);
    });

    it('다른 사용자의 토큰으로 다시 AUTH하면 끊는다', async () => {
      socket.receive({ type: 'AUTH', token: 't' });
      await flush();

      authService.verifyToken.mockResolvedValue({
        userId: 'u2',
        expiresAt: inAnHour(),
      });
      socket.receive({ type: 'AUTH', token: 'other' });
      await flush();

      expect(socket.closedWith?.reason).toBe('User mismatch');
    });
  });

  describe('relayChatEvent', () => {
    beforeEach(async () => {
      socket.receive({ type: 'AUTH', token: 't' });
      socket.receive({ type: 'SUBSCRIBE', channelId: 'c1' });
      await flush();
      socket.sent = [];
    });

    it('구독한 소켓에 MESSAGE_CREATED를 문서 형식으로 보낸다', () => {
      const message = {
        id: 'm1',
        orgId: 'org1',
        createdAt: '2026-11-20T00:00:00.000Z',
      };

      gateway.relayChatEvent(
        JSON.stringify({ type: 'MESSAGE_CREATED', channelId: 'c1', message }),
      );

      expect(socket.sent).toEqual([
        {
          type: 'MESSAGE_CREATED',
          orgId: 'org1',
          channelId: 'c1',
          data: message,
          sentAt: message.createdAt,
        },
      ]);
    });

    it.each([
      ['message 없음', { type: 'MESSAGE_CREATED', channelId: 'c1' }],
      [
        'message가 null',
        { type: 'MESSAGE_CREATED', channelId: 'c1', message: null },
      ],
      ['JSON 아님', 'not-json'],
    ])('형식이 틀린 이벤트(%s)는 예외 없이 버린다', (_name, event) => {
      const raw = typeof event === 'string' ? event : JSON.stringify(event);

      expect(() => gateway.relayChatEvent(raw)).not.toThrow();
      expect(socket.sent).toEqual([]);
    });
  });
});
