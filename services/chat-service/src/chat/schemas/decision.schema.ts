import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({
  collection: 'decisions',
  timestamps: { createdAt: 'registeredAt', updatedAt: false },
  versionKey: false,
})
export class Decision {
  _id!: Types.ObjectId;

  @Prop({ required: true, index: true })
  orgId!: string;

  @Prop({ required: true })
  sourceChannelId!: string;

  // 같은 메시지를 두 번 등록하지 않는다(docs/erd/chat.md)
  @Prop({ required: true, unique: true })
  sourceMessageId!: string;

  @Prop({ required: true })
  text!: string;

  // 메시지를 쓴 사람
  @Prop({ required: true })
  authorId!: string;

  // 결정으로 등록한 사람
  @Prop({ required: true })
  registeredBy!: string;

  registeredAt!: Date;
}

export const DecisionSchema = SchemaFactory.createForClass(Decision);
DecisionSchema.index({ orgId: 1, registeredAt: -1 });
