
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { MembershipModule } from './membership/membership.module';
import { ChatModule } from './chat/chat.module';
import { HealthController } from './health/health.controller';

const dbUrl = process.env.DB_URL;

if (!dbUrl) {
  throw new Error('DB_URL 환경변수가 필요합니다.');
}

@Module({
  imports: [
    MongooseModule.forRoot(dbUrl, {
      user: process.env.DB_USERNAME,
      pass: process.env.DB_PASSWORD,
      serverSelectionTimeoutMS: 5000,
    }),
    RedisModule,
    AuthModule,
    MembershipModule,
    ChatModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
