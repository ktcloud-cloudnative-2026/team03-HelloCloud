
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { MembershipModule } from './membership/membership.module';
import { ChatGateway } from './chat/chat.gateway';

@Module({
  imports: [RedisModule, AuthModule, MembershipModule],
  controllers: [AppController],
  providers: [AppService, ChatGateway],
})
export class AppModule {}
