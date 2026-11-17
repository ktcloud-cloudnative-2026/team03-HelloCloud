import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './redis/redis.module';
import { ChatGateway } from './chat/chat.gateway';

@Module({
  imports: [RedisModule],
  controllers: [AppController],
  providers: [AppService, ChatGateway],
})
export class AppModule {}
