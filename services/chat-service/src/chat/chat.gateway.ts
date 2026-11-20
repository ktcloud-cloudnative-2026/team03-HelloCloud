
import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { WebSocket, RawData } from 'ws';

import { AuthService } from '../auth/auth.service';
import { MembershipService } from '../membership/membership.service';
import { RedisService } from '../redis/redis.service';
import { ChatService } from './chat.service';

type AuthenticatedSocket = WebSocket & {
  userId?: string;
  token?: string;
  // 구독한 채널 ID → 그 채널의 조직 ID. 멤버 제거 알림이 오면 조직으로 찾는다
  subscriptions?: Map<string, string>;
  // 이 연결에서 소속이 빠진 조직. 소속 확인 중이던 SUBSCRIBE가 뒤늦게 붙지 않게 한다
  revokedOrgs?: Set<string>;
  tokenExpiryTimer?: ReturnType<typeof setTimeout>;
  // 지난 ping 이후 pong이 왔는지
  alive?: boolean;
};

// 아무 메시지 없는 연결도 Gateway가 끊지 않도록, 그리고 사라진 브라우저의 연결을
// 정리하도록 주기적으로 ping을 보낸다. 브라우저는 pong을 자동으로 돌려준다.
export const PING_INTERVAL_MS = 30_000;

type ClientMessage = {
  type?: string;
  token?: string;
  channelId?: string;
};

type ChatEvent = {
  type: string;
  channelId: string;
  message: {
    orgId: string;
    createdAt: string;
    [key: string]: unknown;
  };
};

type MemberEvent = {
  type: 'MEMBER_REMOVED';
  orgId: string;
  userId: string;
};

function isMemberEvent(value: unknown): value is MemberEvent {
  if (typeof value !== 'object' || value === null) return false;

  const event = value as Partial<MemberEvent>;

  return (
    event.type === 'MEMBER_REMOVED' &&
    typeof event.orgId === 'string' &&
    typeof event.userId === 'string'
  );
}

function isChatEvent(value: unknown): value is ChatEvent {
  if (typeof value !== 'object' || value === null) return false;

  const event = value as Partial<ChatEvent>;

  return (
    typeof event.type === 'string' &&
    typeof event.channelId === 'string' &&
    typeof event.message === 'object' &&
    event.message !== null &&
    typeof event.message.orgId === 'string' &&
    typeof event.message.createdAt === 'string'
  );
}

@WebSocketGateway({
  path: '/api/chat/ws',
})
export class ChatGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(ChatGateway.name);
  private readonly clients = new Set<AuthenticatedSocket>();
  private pingTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly authService: AuthService,
    private readonly membershipService: MembershipService,
    private readonly chatService: ChatService,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.redisService.subscribe(
      'hellocloud-chat-events',
      (rawMessage: string) => this.relayChatEvent(rawMessage),
    );
    await this.redisService.subscribe(
      'hellocloud-member-events',
      (rawMessage: string) => this.handleMemberEvent(rawMessage),
    );

    this.pingTimer = setInterval(() => this.pingClients(), PING_INTERVAL_MS);

    this.logger.log('Redis → WebSocket 채팅 전달 준비 완료');
  }

  onModuleDestroy(): void {
    clearInterval(this.pingTimer);
  }

  // 한 주기 동안 pong이 없던 연결은 끊고, 나머지에는 다시 ping을 보낸다
  pingClients(): void {
    for (const client of this.clients) {
      if (client.alive === false) {
        client.terminate();
        continue;
      }

      client.alive = false;
      client.ping();
    }
  }

  relayChatEvent(rawMessage: string): void {
    let event: ChatEvent;

    try {
      const parsed: unknown = JSON.parse(rawMessage);

      if (!isChatEvent(parsed)) {
        this.logger.warn('잘못된 Redis 채팅 이벤트');
        return;
      }

      event = parsed;
    } catch {
      this.logger.warn('잘못된 Redis 채팅 이벤트');
      return;
    }

    if (event.type !== 'MESSAGE_CREATED') return;

    const payload = JSON.stringify({
      type: event.type,
      orgId: event.message.orgId,
      channelId: event.channelId,
      data: event.message,
      sentAt: event.message.createdAt,
    });

    for (const client of this.clients) {
      if (
        client.userId &&
        client.readyState === WebSocket.OPEN &&
        client.subscriptions?.has(event.channelId)
      ) {
        client.send(payload);
      }
    }
  }

  // user-service가 멤버를 지우면 보낸다(docs/api/user.md 4절). 새 요청은 소속 확인으로
  // 막히지만 이미 열린 연결은 계속 메시지를 받으므로, 그 조직 채널을 구독한 연결을 끊는다.
  handleMemberEvent(rawMessage: string): void {
    let event: MemberEvent;

    try {
      const parsed: unknown = JSON.parse(rawMessage);

      if (!isMemberEvent(parsed)) {
        this.logger.warn('잘못된 Redis 멤버 이벤트');
        return;
      }

      event = parsed;
    } catch {
      this.logger.warn('잘못된 Redis 멤버 이벤트');
      return;
    }

    for (const client of this.clients) {
      if (client.userId !== event.userId) continue;

      client.revokedOrgs?.add(event.orgId);

      const subscribedOrgs = new Set(client.subscriptions?.values());

      if (subscribedOrgs.has(event.orgId)) {
        client.close(1008, 'Membership revoked');
      }
    }
  }

  handleConnection(client: AuthenticatedSocket): void {
    this.clients.add(client);
    client.subscriptions = new Map<string, string>();
    client.revokedOrgs = new Set<string>();
    client.alive = true;
    client.on('pong', () => {
      client.alive = true;
    });

    this.logger.log('WebSocket 클라이언트 연결');

    client.send(
      JSON.stringify({
        type: 'AUTH_REQUIRED',
        message: '로그인 토큰 인증이 필요합니다.',
      }),
    );

    const authTimeout = setTimeout(() => {
      if (!client.userId) {
        client.close(1008, 'Authentication timeout');
      }
    }, 10000);

    // 메시지를 소켓마다 받은 순서대로 하나씩 처리한다. 동시에 처리하면
    // AUTH가 끝나기 전에 SUBSCRIBE가 거절되거나, 늦게 끝난 SUBSCRIBE가
    // 먼저 처리된 UNSUBSCRIBE를 덮어쓴다.
    let queue: Promise<void> = Promise.resolve();

    client.on('message', (raw: RawData) => {
      queue = queue
        .then(() => this.handleMessage(client, raw, authTimeout))
        .catch((error: unknown) => {
          this.logger.error(
            'WebSocket 메시지 처리 실패',
            error instanceof Error ? error.stack : String(error),
          );
        });
    });

    client.once('close', () => {
      clearTimeout(authTimeout);
      clearTimeout(client.tokenExpiryTimer);
      client.subscriptions?.clear();
      this.clients.delete(client);
    });
  }

  private async handleMessage(
    client: AuthenticatedSocket,
    raw: RawData,
    authTimeout: ReturnType<typeof setTimeout>,
  ): Promise<void> {
    if (client.readyState !== WebSocket.OPEN) return;

    let message: ClientMessage;

    try {
      const parsed: unknown = JSON.parse(raw.toString());

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new Error('Invalid message');
      }

      message = parsed as ClientMessage;
    } catch {
      client.close(1008, 'Invalid message format');
      return;
    }

    if (!client.userId && message.type !== 'AUTH') {
      client.close(1008, 'Authentication required');
      return;
    }

    switch (message.type) {
      case 'AUTH':
        await this.handleAuth(client, message, authTimeout);
        break;

      case 'SUBSCRIBE':
        await this.handleSubscribe(client, message);
        break;

      case 'UNSUBSCRIBE':
        this.handleUnsubscribe(client, message);
        break;

      default:
        this.sendError(
          client,
          'UNSUPPORTED_MESSAGE',
          '지원하지 않는 메시지 유형입니다.',
        );
    }
  }

  private async handleAuth(
    client: AuthenticatedSocket,
    message: ClientMessage,
    authTimeout: ReturnType<typeof setTimeout>,
  ): Promise<void> {
    if (typeof message.token !== 'string' || !message.token) {
      client.close(1008, 'Token required');
      return;
    }

    try {
      const user = await this.authService.verifyToken(message.token);

      if (client.readyState !== WebSocket.OPEN) return;

      // 인증한 뒤 다시 보내는 AUTH는 새 토큰으로 연결을 연장하는 것이다. 다른 사람 토큰은 받지 않는다
      if (client.userId && client.userId !== user.userId) {
        client.close(1008, 'User mismatch');
        return;
      }

      client.userId = user.userId;
      client.token = message.token;
      clearTimeout(authTimeout);
      this.scheduleTokenExpiry(client, user.expiresAt);

      client.send(JSON.stringify({ type: 'AUTH_OK' }));
      this.logger.log('WebSocket 사용자 인증 성공');
    } catch {
      client.close(1008, 'Invalid token');
    }
  }

  // 토큰이 만료되면 연결을 끊는다. 멤버 제거 알림을 놓쳐도(Redis 장애) 토큰 수명 안에는 끊긴다
  private scheduleTokenExpiry(
    client: AuthenticatedSocket,
    expiresAt: number,
  ): void {
    clearTimeout(client.tokenExpiryTimer);

    client.tokenExpiryTimer = setTimeout(
      () => client.close(1008, 'Token expired'),
      Math.max(expiresAt - Date.now(), 0),
    );
  }

  private async handleSubscribe(
    client: AuthenticatedSocket,
    message: ClientMessage,
  ): Promise<void> {
    if (
      typeof message.channelId !== 'string' ||
      !message.channelId.trim()
    ) {
      this.sendError(
        client,
        'INVALID_CHANNEL_ID',
        '유효한 channelId가 필요합니다.',
      );
      return;
    }

    if (!client.userId || !client.token) {
      this.sendError(
        client,
        'AUTH_REQUIRED',
        '인증이 필요합니다.',
      );
      return;
    }

    try {
      const channel = await this.chatService.getChannel(
        message.channelId,
      );

      await this.membershipService.assertMember(
        channel.orgId,
        client.userId,
        client.token,
      );

      if (client.readyState !== WebSocket.OPEN) return;

      if (client.revokedOrgs?.has(channel.orgId)) {
        client.close(1008, 'Membership revoked');
        return;
      }

      client.subscriptions?.set(message.channelId, channel.orgId);

      client.send(
        JSON.stringify({
          type: 'SUBSCRIBED',
          channelId: message.channelId,
        }),
      );
    } catch (error) {
      this.logger.error(
        '채널 구독 권한 검증 실패',
        error instanceof Error ? error.stack : String(error),
      );

      this.sendError(
        client,
        'CHANNEL_ACCESS_DENIED',
        '채널이 없거나 접근 권한이 없습니다.',
      );
    }
  }

  private handleUnsubscribe(
    client: AuthenticatedSocket,
    message: ClientMessage,
  ): void {
    if (
      typeof message.channelId !== 'string' ||
      !message.channelId.trim()
    ) {
      this.sendError(
        client,
        'INVALID_CHANNEL_ID',
        '유효한 channelId가 필요합니다.',
      );
      return;
    }

    client.subscriptions?.delete(message.channelId);

    client.send(
      JSON.stringify({
        type: 'UNSUBSCRIBED',
        channelId: message.channelId,
      }),
    );
  }

  private sendError(
    client: AuthenticatedSocket,
    code: string,
    message: string,
  ): void {
    if (client.readyState !== WebSocket.OPEN) return;

    client.send(
      JSON.stringify({
        type: 'ERROR',
        code,
        message,
      }),
    );
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    client.subscriptions?.clear();
    this.clients.delete(client);
    this.logger.log('WebSocket 클라이언트 연결 종료');
  }
}
