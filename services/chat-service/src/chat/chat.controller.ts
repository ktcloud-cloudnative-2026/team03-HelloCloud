import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';

import { AuthService } from '../auth/auth.service';
import { MembershipService } from '../membership/membership.service';
import {
  AttachmentInput,
  ChatService,
  MAX_ACK_USERS,
  MAX_ATTACHMENTS,
} from './chat.service';
import { DecisionService } from './decision.service';
import { ChannelType } from './schemas/channel.schema';

type CreateChannelBody = {
  orgId?: unknown;
  name?: unknown;
  type?: unknown;
};

type RenameChannelBody = {
  name?: unknown;
};

type CreateMessageBody = {
  clientMessageId?: unknown;
  text?: unknown;
  acknowledgementUserIds?: unknown;
  attachments?: unknown;
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

// 파일 자체의 권한은 미리보기 · 다운로드 때 file 서비스가 확인한다. 여기서는 모양만 본다
function attachmentList(value: unknown): AttachmentInput[] {
  if (value === undefined || value === null) return [];

  const valid = (item: unknown, key: string, max: number) => {
    const field = (item as Record<string, unknown>)[key];
    return typeof field === 'string' && field.trim() !== '' && field.length <= max;
  };

  if (
    !Array.isArray(value) ||
    value.length > MAX_ATTACHMENTS ||
    !value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        valid(item, 'fileId', 100) &&
        valid(item, 'name', 255) &&
        valid(item, 'contentType', 100),
    )
  ) {
    throw new BadRequestException(
      `attachments는 fileId · name · contentType을 가진 최대 ${MAX_ATTACHMENTS}개 목록이어야 합니다.`,
    );
  }

  return value.map((item: Record<string, string>) => ({
    fileId: item.fileId,
    name: item.name,
    contentType: item.contentType,
  }));
}

@Controller('api/chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly authService: AuthService,
    private readonly membershipService: MembershipService,
    private readonly decisionService: DecisionService,
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

  // 조직 멤버면 누구나 바꿀 수 있다(만들기와 같은 권한)
  @Patch('channels/:id')
  async renameChannel(
    @Headers('authorization') authorization: string,
    @Param('id') channelId: string,
    @Body() body: RenameChannelBody,
  ) {
    const { token, userId } = await this.authenticate(authorization);
    const name = optionalString(body?.name, 'name');

    if (!name?.trim()) {
      throw new BadRequestException('채널 이름이 필요합니다.');
    }

    const channel = await this.chatService.getChannel(channelId);

    await this.membershipService.assertMember(channel.orgId, userId, token);

    return this.chatService.renameChannel(channelId, name);
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

    const attachments = attachmentList(body?.attachments);

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
      attachments,
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

    return { userId, message };
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

  // 처음 등록이면 201, 이미 등록된 메시지면 200과 처음 기록
  @Post('messages/:id/decision')
  async registerDecision(
    @Headers('authorization') authorization: string,
    @Param('id') messageId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { userId, message } = await this.authenticateForMessage(
      authorization,
      messageId,
    );

    const { decision, created } = await this.decisionService.register(
      message,
      userId,
    );

    res.status(created ? 201 : 200);
    return decision;
  }

  // 고정 해제. 고정과 같이 메시지 조직의 멤버면 누구나 할 수 있다
  @Delete('messages/:id/decision')
  @HttpCode(204)
  async unregisterDecision(
    @Headers('authorization') authorization: string,
    @Param('id') messageId: string,
  ) {
    const { message } = await this.authenticateForMessage(
      authorization,
      messageId,
    );

    await this.decisionService.unregister(String(message._id));
  }

  @Get('decisions')
  async getDecisions(
    @Headers('authorization') authorization: string,
    @Query('orgId') rawOrgId: unknown,
  ) {
    const { token, userId } = await this.authenticate(authorization);
    const orgId = optionalString(rawOrgId, 'orgId');

    if (!orgId?.trim()) {
      throw new BadRequestException('orgId가 필요합니다.');
    }

    await this.membershipService.assertMember(orgId, userId, token);

    return this.decisionService.list(orgId);
  }
}
