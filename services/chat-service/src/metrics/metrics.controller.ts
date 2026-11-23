import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';

import { MetricsService } from './metrics.service';

// Prometheus(spring-services ServiceMonitor)가 30초마다 부르는 주소.
// Gateway에는 /api/chat만 연결되어 있어 밖에서는 부를 수 없다.
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async metrics(@Res() res: Response): Promise<void> {
    res.type(this.metricsService.contentType);
    res.send(await this.metricsService.metrics());
  }
}
