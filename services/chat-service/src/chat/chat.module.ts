
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import { MembershipModule } from '../membership/membership.module';
import { RedisModule } from '../redis/redis.module';

import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';

import {
  Channel,
  ChannelSchema,
} from './schemas/channel.schema';

import {
  Message,
  MessageSchema,
} from './schemas/message.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Channel.name, schema: ChannelSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    AuthModule,
    MembershipModule,
    RedisModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
  exports: [ChatService, MongooseModule],
})
export class ChatModule {}
