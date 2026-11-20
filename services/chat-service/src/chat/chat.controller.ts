
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
  orgId?: unknown;
  name?: unknown;
  type?: unknown;
};

type CreateMessageBody = {
  clientMessageId?: unknown;
  text?: unknown;
};

// 쿼리는 같은 키가 여러 번 오면 배열, JSON 본문은 숫자나 객체일 수 있다.
// 문자열이 아니면 서비스의 trim()에서 500이 나므로 여기서 400으로 막는다.
function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;

  if (typeof value !== 'string') {
    throw new BadRequestException(`${field}는 문자열이어야 합니다.`);
  }

  return value;
}

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
    @Query('orgId') rawOrgId: unknown,
  ) {
    const { token, userId } = await this.authenticate(authorization);
    const orgId = optionalString(rawOrgId, 'orgId');

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

    const orgId = optionalString(body?.orgId, 'orgId');
    const name = optionalString(body?.name, 'name');
    const type = optionalString(body?.type, 'type') as ChannelType | undefined;

    if (!orgId?.trim()) {
      throw new BadRequestException('orgId가 필요합니다.');
    }

    await this.membershipService.assertMember(orgId, userId, token);

    return this.chatService.createChannel(
      orgId,
      name ?? '',
      userId,
      type ?? ChannelType.NORMAL,
    );
  }

  @Post('channels/:id/messages')
  async createMessage(
    @Headers('authorization') authorization: string,
    @Param('id') channelId: string,
    @Body() body: CreateMessageBody,
  ) {
    const { token, userId } = await this.authenticate(authorization);
    const clientMessageId = optionalString(
      body?.clientMessageId,
      'clientMessageId',
    );
    const text = optionalString(body?.text, 'text');

    const channel = await this.chatService.getChannel(channelId);

    await this.membershipService.assertMember(
      channel.orgId,
      userId,
      token,
    );

    return this.chatService.createMessage(
      channelId,
      userId,
      clientMessageId ?? '',
      text ?? '',
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
