import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Headers,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthService } from '../auth/auth.service';
import { MembershipService } from '../membership/membership.service';
import { ChatService, MAX_ACK_USERS } from './chat.service';
import { ChannelType } from './schemas/channel.schema';

type CreateChannelBody = {
  orgId?: unknown;
  name?: unknown;
  type?: unknown;
};

type CreateMessageBody = {
  clientMessageId?: unknown;
  text?: unknown;
  acknowledgementUserIds?: unknown;
};

type ReactionBody = {
  emoji?: unknown;
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

function optionalStringArray(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];

  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'string' && item.trim())
  ) {
    throw new BadRequestException(`${field}는 문자열 목록이어야 합니다.`);
  }

  return value as string[];
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
    const ackUserIds = [
      ...new Set(
        optionalStringArray(
          body?.acknowledgementUserIds,
          'acknowledgementUserIds',
        ),
      ),
    ];

    if (ackUserIds.length > MAX_ACK_USERS) {
      throw new BadRequestException(
        `확인 요청은 최대 ${MAX_ACK_USERS}명까지 지정할 수 있습니다.`,
      );
    }

    const channel = await this.chatService.getChannel(channelId);

    await this.membershipService.assertMember(channel.orgId, userId, token);

    // 확인을 요청할 사람도 같은 조직 멤버여야 한다
    const memberships = await Promise.all(
      ackUserIds.map((id) =>
        this.membershipService.isMember(channel.orgId, id, token),
      ),
    );

    if (memberships.includes(false)) {
      throw new BadRequestException(
        '확인 요청 대상에 조직 멤버가 아닌 사람이 있습니다.',
      );
    }

    return this.chatService.createMessage(
      channelId,
      userId,
      clientMessageId ?? '',
      text ?? '',
      ackUserIds,
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

    await this.membershipService.assertMember(channel.orgId, userId, token);

    const parsedAfter = after === undefined ? 0 : Number(after);
    const parsedLimit = limit === undefined ? 50 : Number(limit);

    return this.chatService.getMessages(channelId, parsedAfter, parsedLimit);
  }

  // 메시지가 속한 조직의 멤버인지 확인한다
  private async authenticateForMessage(
    authorization: string,
    messageId: string,
  ) {
    const { token, userId } = await this.authenticate(authorization);
    const message = await this.chatService.getMessage(messageId);

    await this.membershipService.assertMember(message.orgId, userId, token);

    return { userId };
  }

  @Get('messages/:id/acknowledgements')
  async getAcknowledgements(
    @Headers('authorization') authorization: string,
    @Param('id') messageId: string,
  ) {
    const { userId } = await this.authenticateForMessage(
      authorization,
      messageId,
    );

    return this.chatService.getAcknowledgements(messageId, userId);
  }

  @Post('messages/:id/acknowledgements')
  @HttpCode(200)
  async confirm(
    @Headers('authorization') authorization: string,
    @Param('id') messageId: string,
  ) {
    const { userId } = await this.authenticateForMessage(
      authorization,
      messageId,
    );

    return this.chatService.confirm(messageId, userId);
  }

  @Post('messages/:id/reactions')
  @HttpCode(200)
  async addReaction(
    @Headers('authorization') authorization: string,
    @Param('id') messageId: string,
    @Body() body: ReactionBody,
  ) {
    const { userId } = await this.authenticateForMessage(
      authorization,
      messageId,
    );

    return this.chatService.addReaction(messageId, userId, body?.emoji);
  }

  @Delete('messages/:id/reactions/:emoji')
  @HttpCode(204)
  async removeReaction(
    @Headers('authorization') authorization: string,
    @Param('id') messageId: string,
    @Param('emoji') emoji: string,
  ) {
    const { userId } = await this.authenticateForMessage(
      authorization,
      messageId,
    );

    await this.chatService.removeReaction(messageId, userId, emoji);
  }
}
