
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthService } from '../auth/auth.service';
import { MembershipService } from '../membership/membership.service';
import { ChatService } from './chat.service';
import { ChannelType } from './schemas/channel.schema';

type CreateChannelBody = {
  orgId?: string;
  name?: string;
  type?: ChannelType;
};

type CreateMessageBody = {
  clientMessageId?: string;
  text?: string;
};

@Controller('api/chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly authService: AuthService,
    private readonly membershipService: MembershipService,
  ) {}

  private async authenticate(authorization?: string) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization ?? '');

    if (!match) {
      throw new UnauthorizedException('로그인 토큰이 필요합니다.');
    }

    const token = match[1].trim();
    const user = await this.authService.verifyToken(token);

    return { token, userId: user.userId };
  }

  @Get('channels')
  async getChannels(
    @Headers('authorization') authorization: string,
    @Query('orgId') orgId: string,
  ) {
    const { token, userId } = await this.authenticate(authorization);

    if (!orgId?.trim()) {
      throw new BadRequestException('orgId가 필요합니다.');
    }

    await this.membershipService.assertMember(orgId, userId, token);

    return this.chatService.getChannels(orgId);
  }

  @Post('channels')
  async createChannel(
    @Headers('authorization') authorization: string,
    @Body() body: CreateChannelBody,
  ) {
    const { token, userId } = await this.authenticate(authorization);

    if (!body?.orgId?.trim()) {
      throw new BadRequestException('orgId가 필요합니다.');
    }

    await this.membershipService.assertMember(
      body.orgId,
      userId,
      token,
    );

    return this.chatService.createChannel(
      body.orgId,
      body.name ?? '',
      userId,
      body.type ?? ChannelType.NORMAL,
    );
  }

  @Post('channels/:id/messages')
  async createMessage(
    @Headers('authorization') authorization: string,
    @Param('id') channelId: string,
    @Body() body: CreateMessageBody,
  ) {
    const { token, userId } = await this.authenticate(authorization);

    const channel = await this.chatService.getChannel(channelId);

    await this.membershipService.assertMember(
      channel.orgId,
      userId,
      token,
    );

    return this.chatService.createMessage(
      channelId,
      userId,
      body?.clientMessageId ?? '',
      body?.text ?? '',
    );
  }

  @Get('channels/:id/messages')
  async getMessages(
    @Headers('authorization') authorization: string,
    @Param('id') channelId: string,
    @Query('after') after?: string,
    @Query('limit') limit?: string,
  ) {
    const { token, userId } = await this.authenticate(authorization);

    const channel = await this.chatService.getChannel(channelId);

    await this.membershipService.assertMember(
      channel.orgId,
      userId,
      token,
    );

    const parsedAfter = after === undefined ? 0 : Number(after);
    const parsedLimit = limit === undefined ? 50 : Number(limit);

    return this.chatService.getMessages(
      channelId,
      parsedAfter,
      parsedLimit,
    );
  }
}
