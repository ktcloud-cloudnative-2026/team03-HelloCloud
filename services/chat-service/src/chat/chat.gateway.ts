
import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { WebSocket } from 'ws';
import { RedisService } from '../redis/redis.service';

@WebSocketGateway({
  path: '/api/chat/ws',
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);

  constructor(private readonly redisService: RedisService) {}

  handleConnection(client: WebSocket): void {
    this.logger.log('WebSocket 클라이언트 연결');

    // 인증 기능 연동 전에는 채널 구독을 허용하지 않음
    client.send(
      JSON.stringify({
        type: 'AUTH_REQUIRED',
        message: '로그인 토큰 인증이 필요합니다.',
      }),
    );
  }

  handleDisconnect(): void {
    this.logger.log('WebSocket 클라이언트 연결 종료');
  }
}
