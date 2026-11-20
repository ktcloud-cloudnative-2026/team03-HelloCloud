import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ConnectionStates } from 'mongoose';

// Kubernetes가 파드 상태를 확인하는 주소(docs/conventions.md).
// readiness는 MongoDB만 본다. Redis가 멈춰도 메시지 저장과 조회는 되어야 하므로
// (requirements.md 가용성) Redis 때문에 파드를 트래픽에서 빼지 않는다.
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get('liveness')
  liveness() {
    return { status: 'UP' };
  }

  @Get('readiness')
  readiness() {
    if (this.connection.readyState !== ConnectionStates.connected) {
      throw new ServiceUnavailableException({ status: 'DOWN' });
    }

    return { status: 'UP' };
  }
}
