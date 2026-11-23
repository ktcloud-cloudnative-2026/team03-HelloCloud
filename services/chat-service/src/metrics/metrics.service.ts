import { Injectable } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';

// Prometheus가 /metrics로 가져가는 지표(#199).
// HTTP 지표 이름 · 이름표는 user · file(Spring)과 같게 둬서 부하 테스트 대시보드
// 쿼리(http_server_requests_seconds{job=...})에 chat-service를 그대로 넣을 수 있게 한다.
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  private readonly httpRequests = new Histogram({
    name: 'http_server_requests_seconds',
    help: 'HTTP 요청 처리 시간(초)',
    labelNames: ['method', 'uri', 'status'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  private webSocketCount: () => number = () => 0;

  constructor() {
    // CPU · 메모리 · 이벤트 루프 지연 등 Node 기본 지표
    collectDefaultMetrics({ register: this.registry });

    const count = () => this.webSocketCount();
    new Gauge({
      name: 'chat_websocket_connections',
      help: '이 파드에 열려 있는 WebSocket 연결 수',
      registers: [this.registry],
      collect() {
        this.set(count());
      },
    });
  }

  // 연결 수는 게이트웨이가 들고 있으므로, 가져갈 때마다 그 수를 읽는다
  trackWebSocketConnections(count: () => number): void {
    this.webSocketCount = count;
  }

  // 응답이 끝난 뒤 걸린 시간을 기록한다. uri는 실제 주소가 아니라 라우트 모양
  // (/api/chat/channels/:id)이라 채널 · 메시지 번호마다 지표가 늘어나지 않는다.
  readonly httpMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const end = this.httpRequests.startTimer();
    res.once('finish', () => {
      end({
        method: req.method,
        uri: routeTemplate(req),
        status: String(res.statusCode),
      });
    });
    next();
  };

  metrics(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}

// 맞는 라우트가 없던 요청(404 등)은 주소를 그대로 쓰지 않고 UNKNOWN으로 묶는다
function routeTemplate(req: Request): string {
  const route = req.route as { path?: unknown } | undefined;
  if (typeof route?.path !== 'string') {
    return 'UNKNOWN';
  }
  return `${req.baseUrl ?? ''}${route.path}`;
}
