import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { RedisService } from '../redis/redis.service';
import { Channel, ChannelType } from './schemas/channel.schema';
import { Message } from './schemas/message.schema';

// 화면이 채널과 메시지를 같은 모양(id 문자열)으로 다루도록 MongoDB의 _id를 바꾼다
function toResponse<T extends { _id: unknown }>(
  message: T,
): Omit<T, '_id'> & { id: string } {
  const { _id, ...data } = message;

  return {
    ...data,
    id: String(_id),
  };
}

// 메시지에 달 수 있는 이모지. 화면의 선택지와 같다
export const ALLOWED_REACTIONS = ['👍', '✅', '❤️', '😂', '🎉', '👀'];
// 확인 요청으로 지정할 수 있는 최대 인원
export const MAX_ACK_USERS = 20;
// 메시지 하나에 붙일 수 있는 파일 수
export const MAX_ATTACHMENTS = 5;

export type AttachmentInput = {
  fileId: string;
  name: string;
  contentType: string;
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly redisChannel = 'hellocloud-chat-events';

  constructor(
    @InjectModel(Channel.name)
    private readonly channelModel: Model<Channel>,

    @InjectModel(Message.name)
    private readonly messageModel: Model<Message>,

    private readonly redisService: RedisService,
  ) {}

  // 조직에 속한 채팅방 목록 조회
  async getChannels(orgId: string) {
    const channels = await this.channelModel
      .find({ orgId })
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    return channels.map(toResponse);
  }

  // 특정 채팅방 조회
  async getChannel(channelId: string) {
    if (!Types.ObjectId.isValid(channelId)) {
      throw new NotFoundException('채팅방을 찾을 수 없습니다.');
    }

    const channel = await this.channelModel.findById(channelId).lean().exec();

    if (!channel) {
      throw new NotFoundException('채팅방을 찾을 수 없습니다.');
    }

    return channel;
  }

  // 새로운 채팅방 생성
  async createChannel(
    orgId: string,
    name: string,
    createdBy: string,
    type: ChannelType = ChannelType.NORMAL,
  ) {
    const channelName = name?.trim();

    if (!orgId?.trim() || !createdBy?.trim() || !channelName) {
      throw new BadRequestException(
        '조직 ID, 채널 이름, 생성자 ID가 필요합니다.',
      );
    }

    if (!Object.values(ChannelType).includes(type)) {
      throw new BadRequestException('올바르지 않은 채널 유형입니다.');
    }

    if (channelName.length > 50) {
      throw new BadRequestException(
        '채널 이름은 최대 50자까지 입력할 수 있습니다.',
      );
    }

    const channel = await this.channelModel.create({
      orgId,
      name: channelName,
      type,
      lastSeq: 0,
      createdBy,
    });

    return toResponse(channel.toObject());
  }

  // 메시지 저장
  async createMessage(
    channelId: string,
    senderId: string,
    clientMessageId: string,
    text: string,
    acknowledgementUserIds: string[] = [],
    attachments: AttachmentInput[] = [],
  ) {
    if (!senderId?.trim() || !clientMessageId?.trim()) {
      throw new BadRequestException(
        '작성자와 클라이언트 메시지 ID가 필요합니다.',
      );
    }

    if (!text?.trim() && attachments.length === 0) {
      throw new BadRequestException('내용이나 첨부 파일이 필요합니다.');
    }

    // 메시지 최대 길이 제한 (4000자)
    if (text.trim().length > 4000) {
      throw new BadRequestException(
        '메시지는 최대 4000자까지 입력할 수 있습니다.',
      );
    }

    const channel = await this.getChannel(channelId);

    // 동일한 요청이 이미 저장되었다면 기존 메시지 반환
    const existingMessage = await this.messageModel
      .findOne({ channelId, clientMessageId })
      .lean()
      .exec();

    if (existingMessage) {
      if (existingMessage.senderId !== senderId) {
        throw new ConflictException(
          '이미 다른 사용자가 사용한 메시지 ID입니다.',
        );
      }

      return toResponse(existingMessage);
    }

    // 채널별 메시지 번호를 원자적으로 증가
    const updatedChannel = await this.channelModel
      .findOneAndUpdate(
        { _id: channel._id },
        { $inc: { lastSeq: 1 } },
        { new: true },
      )
      .exec();

    if (!updatedChannel) {
      throw new NotFoundException('채팅방을 찾을 수 없습니다.');
    }

    try {
      const message = await this.messageModel.create({
        orgId: channel.orgId,
        channelId,
        seq: updatedChannel.lastSeq,
        clientMessageId,
        senderType: 'USER',
        senderId,
        text: text.trim(),
        attachments,
        reactions: [],
        acknowledgement: {
          // 보낸 사람 자신은 확인할 필요가 없다
          requiredUserIds: [...new Set(acknowledgementUserIds)].filter(
            (userId) => userId !== senderId,
          ),
          confirmed: [],
        },
      });

      const savedMessage = toResponse(message.toObject());

      // MongoDB 저장 성공 후 Redis 이벤트 발행
      try {
        await this.redisService.publish(this.redisChannel, {
          type: 'MESSAGE_CREATED',
          channelId,
          message: savedMessage,
        });
      } catch (error) {
        // 메시지는 이미 저장됐으므로 API 성공은 유지
        this.logger.error(
          '메시지 저장 후 Redis 이벤트 발행 실패',
          error instanceof Error ? error.stack : String(error),
        );
      }

      return savedMessage;
    } catch (error) {
      // 동시 요청으로 중복 키 충돌이 발생한 경우
      if (error instanceof Error && 'code' in error && error.code === 11000) {
        const savedMessage = await this.messageModel
          .findOne({ channelId, clientMessageId })
          .lean()
          .exec();

        if (savedMessage) {
          if (savedMessage.senderId !== senderId) {
            throw new ConflictException(
              '이미 다른 사용자가 사용한 메시지 ID입니다.',
            );
          }

          return toResponse(savedMessage);
        }

        throw new ConflictException('메시지 저장 중 중복 충돌이 발생했습니다.');
      }

      throw error;
    }
  }

  // 채널별 메시지 조회
  async getMessages(channelId: string, after = 0, limit = 50) {
    await this.getChannel(channelId);

    if (
      !Number.isInteger(after) ||
      after < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      throw new BadRequestException('after 또는 limit 값이 올바르지 않습니다.');
    }

    const messages = await this.messageModel
      .find({
        channelId,
        seq: { $gt: after },
      })
      .sort({ seq: 1 })
      .limit(limit)
      .lean()
      .exec();

    return messages.map(toResponse);
  }

  // 메시지와 그 채널의 조직을 찾는다. 권한 확인은 부른 쪽이 orgId로 한다
  async getMessage(messageId: string) {
    if (!Types.ObjectId.isValid(messageId)) {
      throw new NotFoundException('메시지를 찾을 수 없습니다.');
    }

    const message = await this.messageModel.findById(messageId).lean().exec();

    if (!message) {
      throw new NotFoundException('메시지를 찾을 수 없습니다.');
    }

    return message;
  }

  // 보낸 사람만 본다. 지정한 사람마다 확인 시각(없으면 null)을 준다
  async getAcknowledgements(messageId: string, userId: string) {
    const message = await this.getMessage(messageId);

    if (message.senderId !== userId) {
      throw new ForbiddenException('보낸 사람만 확인 현황을 볼 수 있습니다.');
    }

    const confirmedAt = new Map(
      (message.acknowledgement?.confirmed ?? []).map((c) => [c.userId, c.at]),
    );

    return {
      messageId,
      users: (message.acknowledgement?.requiredUserIds ?? []).map((id) => ({
        userId: id,
        confirmedAt: confirmedAt.get(id)?.toISOString() ?? null,
      })),
    };
  }

  // 지정된 사람만 확인한다. 이미 확인했으면 그대로 둔다
  async confirm(messageId: string, userId: string) {
    const message = await this.getMessage(messageId);

    if (!message.acknowledgement?.requiredUserIds?.includes(userId)) {
      throw new ForbiddenException(
        '확인 요청을 받은 사람만 확인할 수 있습니다.',
      );
    }

    const updated = await this.messageModel
      .findOneAndUpdate(
        {
          _id: message._id,
          'acknowledgement.confirmed.userId': { $ne: userId },
        },
        { $push: { 'acknowledgement.confirmed': { userId, at: new Date() } } },
        { new: true },
      )
      .lean()
      .exec();

    if (!updated) return toResponse(message);

    return this.publishUpdated(updated);
  }

  async addReaction(messageId: string, userId: string, emoji: unknown) {
    if (typeof emoji !== 'string' || !ALLOWED_REACTIONS.includes(emoji)) {
      throw new BadRequestException('지원하지 않는 이모지입니다.');
    }

    const message = await this.getMessage(messageId);

    // 같은 이모지가 있으면 사용자만 더하고, 없으면 새로 만든다. 동시에 처음 누르면
    // 두 번째 시도에서 첫 번째 조건에 걸린다
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const added = await this.messageModel
        .findOneAndUpdate(
          { _id: message._id, 'reactions.emoji': emoji },
          { $addToSet: { 'reactions.$.userIds': userId } },
          { new: true },
        )
        .lean()
        .exec();

      if (added) return this.publishUpdated(added);

      const created = await this.messageModel
        .findOneAndUpdate(
          { _id: message._id, 'reactions.emoji': { $ne: emoji } },
          { $push: { reactions: { emoji, userIds: [userId] } } },
          { new: true },
        )
        .lean()
        .exec();

      if (created) return this.publishUpdated(created);
    }

    throw new ConflictException(
      '이모지를 추가하지 못했습니다. 다시 시도해 주세요.',
    );
  }

  async removeReaction(messageId: string, userId: string, emoji: string) {
    const message = await this.getMessage(messageId);

    await this.messageModel
      .updateOne(
        { _id: message._id, 'reactions.emoji': emoji },
        { $pull: { 'reactions.$.userIds': userId } },
      )
      .exec();

    // 아무도 누르지 않은 이모지는 지운다
    const updated = await this.messageModel
      .findOneAndUpdate(
        { _id: message._id },
        { $pull: { reactions: { userIds: { $size: 0 } } } },
        { new: true },
      )
      .lean()
      .exec();

    if (updated) await this.publishUpdated(updated);
  }

  // 이모지 · 확인 변경을 같은 채널을 보는 사람에게 알린다(MESSAGE_UPDATED)
  private async publishUpdated<T extends { _id: unknown; channelId: string }>(
    message: T,
  ) {
    const response = toResponse(message);

    try {
      await this.redisService.publish(this.redisChannel, {
        type: 'MESSAGE_UPDATED',
        channelId: message.channelId,
        message: response,
      });
    } catch (error) {
      this.logger.error(
        '메시지 변경 후 Redis 이벤트 발행 실패',
        error instanceof Error ? error.stack : String(error),
      );
    }

    return response;
  }
}
