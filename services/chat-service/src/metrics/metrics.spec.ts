import { Controller, Get, INestApplication, Param } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { MetricsModule } from './metrics.module';
import { MetricsService } from './metrics.service';

@Controller('api/chat/channels')
class FakeChannelController {
  @Get(':id')
  get(@Param('id') id: string) {
    return { id };
  }
}

describe('Metrics', () => {
  let app: INestApplication<App>;
  let metrics: MetricsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MetricsModule],
      controllers: [FakeChannelController],
    }).compile();

    app = moduleRef.createNestApplication();
    metrics = app.get(MetricsService);
    app.use(metrics.httpMiddleware);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const scrape = async () => {
    const res = await request(app.getHttpServer()).get('/metrics').expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    return res.text;
  };

  it('Node 기본 지표를 Prometheus 형식으로 낸다', async () => {
    const text = await scrape();

    expect(text).toContain('process_cpu_seconds_total');
    expect(text).toContain('nodejs_eventloop_lag_seconds');
  });

  it('HTTP 요청을 번호가 아니라 라우트 모양으로 센다', async () => {
    await request(app.getHttpServer())
      .get('/api/chat/channels/abc')
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/chat/channels/def')
      .expect(200);

    const text = await scrape();

    expect(text).toMatch(
      /http_server_requests_seconds_count\{method="GET",uri="\/api\/chat\/channels\/:id",status="200"\} 2/,
    );
    expect(text).not.toContain('/api/chat/channels/abc');
    expect(text).toContain('http_server_requests_seconds_bucket{le="0.5"');
  });

  it('맞는 라우트가 없는 요청은 UNKNOWN으로 묶는다', async () => {
    await request(app.getHttpServer()).get('/nope/123').expect(404);

    const text = await scrape();

    expect(text).toMatch(
      /http_server_requests_seconds_count\{method="GET",uri="UNKNOWN",status="404"\} 1/,
    );
    expect(text).not.toContain('/nope/123');
  });

  it('WebSocket 연결 수는 가져갈 때마다 게이트웨이에서 읽는다', async () => {
    let open = 3;
    metrics.trackWebSocketConnections(() => open);

    expect(await scrape()).toContain('chat_websocket_connections 3');

    open = 1;
    expect(await scrape()).toContain('chat_websocket_connections 1');
  });
});
