import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Decision } from './schemas/decision.schema';

type SourceMessage = {
  _id: unknown;
  orgId: string;
  channelId: string;
  senderId: string;
  text: string;
};

function toResponse(decision: Decision) {
  const { _id, registeredAt, ...rest } = decision;
  return {
    ...rest,
    id: String(_id),
    registeredAt: new Date(registeredAt).toISOString(),
  };
}

const LIST_LIMIT = 100;

@Injectable()
export class DecisionService {
  constructor(
    @InjectModel(Decision.name)
    private readonly decisionModel: Model<Decision>,
  ) {}

  // 처음 등록이면 created=true. 이미 있으면(동시에 눌러도) 처음 기록을 돌려준다
  async register(message: SourceMessage, registeredBy: string) {
    const sourceMessageId = String(message._id);

    const result = await this.decisionModel
      .findOneAndUpdate(
        { sourceMessageId },
        {
          $setOnInsert: {
            orgId: message.orgId,
            sourceChannelId: message.channelId,
            sourceMessageId,
            text: message.text,
            authorId: message.senderId,
            registeredBy,
          },
        },
        { upsert: true, new: true, includeResultMetadata: true, lean: true },
      )
      .exec()
      .catch(async (error: unknown) => {
        // 동시 upsert가 고유 인덱스에 걸리면 먼저 들어간 기록을 읽는다
        if (error instanceof Error && 'code' in error && error.code === 11000) {
          const existing = await this.decisionModel
            .findOne({ sourceMessageId })
            .lean()
            .exec();
          return {
            value: existing,
            lastErrorObject: { updatedExisting: true },
          };
        }
        throw error;
      });

    return {
      decision: toResponse(result.value as Decision),
      created: !result.lastErrorObject?.updatedExisting,
    };
  }

  async list(orgId: string) {
    const decisions = await this.decisionModel
      .find({ orgId })
      .sort({ registeredAt: -1 })
      .limit(LIST_LIMIT)
      .lean()
      .exec();

    return decisions.map(toResponse);
  }
}
