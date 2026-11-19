
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { RedisService } from '../redis/redis.service';
import { Channel, ChannelType } from './schemas/channel.schema';
import { Message } from './schemas/message.schema';

function toMessageResponse<T extends { _id: unknown }>(
  message: T,
): Omit<T, '_id'> & { id: string } {
  const { _id, ...data } = message;

  return {
    ...data,
    id: String(_id),
  };
}

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
    return this.channelModel
      .find({ orgId })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
  }

  // 특정 채팅방 조회
  async getChannel(channelId: string) {
    if (!Types.ObjectId.isValid(channelId)) {
      throw new NotFoundException('채팅방을 찾을 수 없습니다.');
    }

    const channel = await this.channelModel
      .findById(channelId)
      .lean()
      .exec();

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
      throw new BadRequestException(
        '올바르지 않은 채널 유형입니다.',
      );
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

    return channel.toObject();
  }

  // 메시지 저장
  async createMessage(
    channelId: string,
    senderId: string,
    clientMessageId: string,
    text: string,
  ) {
    if (!senderId?.trim() || !clientMessageId?.trim() || !text?.trim()) {
      throw new BadRequestException(
        '작성자, 클라이언트 메시지 ID, 내용이 필요합니다.',
      );
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

      return toMessageResponse(existingMessage);
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
        attachments: [],
        reactions: [],
        acknowledgement: {
          requiredUserIds: [],
          confirmed: [],
        },
      });

      const savedMessage = toMessageResponse(message.toObject());

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
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 11000
      ) {
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

          return toMessageResponse(savedMessage);
        }

        throw new ConflictException(
          '메시지 저장 중 중복 충돌이 발생했습니다.',
        );
      }

      throw error;
    }
  }

  // 채널별 메시지 조회
  async getMessages(
    channelId: string,
    after = 0,
    limit = 50,
  ) {
    await this.getChannel(channelId);

    if (
      !Number.isInteger(after) ||
      after < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      throw new BadRequestException(
        'after 또는 limit 값이 올바르지 않습니다.',
      );
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

    return messages.map(toMessageResponse);
  }
}
