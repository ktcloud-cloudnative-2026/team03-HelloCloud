
import { Logger, OnModuleInit } from '@nestjs/common';
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
  subscriptions?: Set<string>;
};

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

@WebSocketGateway({
  path: '/api/chat/ws',
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  private readonly logger = new Logger(ChatGateway.name);
  private readonly clients = new Set<AuthenticatedSocket>();

  constructor(
    private readonly authService: AuthService,
    private readonly membershipService: MembershipService,
    private readonly chatService: ChatService,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.redisService.subscribe(
      'hellocloud-chat-events',
      (rawMessage: string) => {
        let event: ChatEvent;

        try {
          event = JSON.parse(rawMessage) as ChatEvent;

          if (
            event.type !== 'MESSAGE_CREATED' ||
            typeof event.channelId !== 'string'
          ) {
            return;
          }
        } catch {
          this.logger.warn('잘못된 Redis 채팅 이벤트');
          return;
        }

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
      },
    );

    this.logger.log('Redis → WebSocket 채팅 전달 준비 완료');
  }

  handleConnection(client: AuthenticatedSocket): void {
    this.clients.add(client);
    client.subscriptions = new Set<string>();

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

    client.on('message', async (raw: RawData) => {
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
    });

    client.once('close', () => {
      clearTimeout(authTimeout);
      client.subscriptions?.clear();
      this.clients.delete(client);
    });
  }

  private async handleAuth(
    client: AuthenticatedSocket,
    message: ClientMessage,
    authTimeout: ReturnType<typeof setTimeout>,
  ): Promise<void> {
    if (client.userId) {
      client.send(JSON.stringify({ type: 'AUTH_OK' }));
      return;
    }

    if (typeof message.token !== 'string' || !message.token) {
      client.close(1008, 'Token required');
      return;
    }

    try {
      const user = await this.authService.verifyToken(message.token);

      if (client.readyState !== WebSocket.OPEN) return;

      client.userId = user.userId;
      client.token = message.token;
      clearTimeout(authTimeout);

      client.send(JSON.stringify({ type: 'AUTH_OK' }));
      this.logger.log('WebSocket 사용자 인증 성공');
    } catch {
      client.close(1008, 'Invalid token');
    }
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

      client.subscriptions?.add(message.channelId);

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
