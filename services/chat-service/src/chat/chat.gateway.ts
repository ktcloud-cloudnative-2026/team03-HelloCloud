
import { Logger, OnModuleInit } from '@nestjs/common';
import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { WebSocket, RawData } from 'ws';
import { AuthService } from '../auth/auth.service';
import { RedisService } from '../redis/redis.service';

type AuthenticatedSocket = WebSocket & {
  userId?: string;
  subscriptions?: Set<string>;
};

type ClientMessage = {
  type?: string;
  token?: string;
  channelId?: string;
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
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    // 개발용 Redis 전달 테스트
    if (process.env.CHAT_RELAY_TEST_MODE !== 'true') {
      this.logger.log('개발용 Redis 전달 테스트 비활성화');
      return;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '운영 환경에서는 CHAT_RELAY_TEST_MODE를 사용할 수 없습니다.',
      );
    }

    await this.redisService.subscribe(
      'hellocloud-chat-relay-test',
      (rawMessage: string) => {
        let data: unknown;

        try {
          data = JSON.parse(rawMessage);
        } catch {
          this.logger.warn('잘못된 Redis 테스트 메시지');
          return;
        }

        const event = JSON.stringify({
          type: 'RELAY_TEST',
          data,
        });

        for (const client of this.clients) {
          if (
            client.userId &&
            client.readyState === WebSocket.OPEN
          ) {
            client.send(event);
          }
        }
      },
    );

    this.logger.log('개발용 Redis → WebSocket 전달 준비 완료');
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

      // 인증되지 않은 사용자는 AUTH만 허용
      if (!client.userId && message.type !== 'AUTH') {
        client.close(1008, 'Authentication required');
        return;
      }

      switch (message.type) {
        case 'AUTH':
          await this.handleAuth(client, message, authTimeout);
          break;

        case 'SUBSCRIBE':
          this.handleSubscribe(client, message);
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
      const user = await this.authService.verifyToken(
        message.token,
      );

      if (client.readyState !== WebSocket.OPEN) return;

      client.userId = user.userId;
      clearTimeout(authTimeout);

      client.send(JSON.stringify({ type: 'AUTH_OK' }));
      this.logger.log('WebSocket 사용자 인증 성공');
    } catch {
      client.close(1008, 'Invalid token');
    }
  }

  private handleSubscribe(
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

    // TODO: MongoDB channels에서 channelId로 orgId 조회
    // TODO: MembershipService.assertMember(orgId, userId, token)
    // 권한 검증 전에는 구독을 허용하지 않는다.
    this.sendError(
      client,
      'CHANNEL_VERIFICATION_UNAVAILABLE',
      '채널 권한 검증 기능이 아직 준비되지 않았습니다.',
    );
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
