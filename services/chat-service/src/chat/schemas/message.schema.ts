
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MessageDocument = HydratedDocument<Message>;

@Schema({ _id: false })
export class Attachment {
  @Prop({ required: true })
  fileId!: string;

  @Prop({ required: true })
  name!: string;
}

export const AttachmentSchema = SchemaFactory.createForClass(Attachment);

@Schema({ _id: false })
export class Reaction {
  @Prop({ required: true })
  emoji!: string;

  @Prop({ type: [String], default: [] })
  userIds!: string[];
}

export const ReactionSchema = SchemaFactory.createForClass(Reaction);

@Schema({ _id: false })
export class Confirmation {
  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true, type: Date })
  at!: Date;
}

export const ConfirmationSchema = SchemaFactory.createForClass(Confirmation);

@Schema({ _id: false })
export class Acknowledgement {
  @Prop({ type: [String], default: [] })
  requiredUserIds!: string[];

  @Prop({ type: [ConfirmationSchema], default: [] })
  confirmed!: Confirmation[];
}

export const AcknowledgementSchema =
  SchemaFactory.createForClass(Acknowledgement);

@Schema({
  collection: 'messages',
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
})
export class Message {
  _id!: Types.ObjectId;

  @Prop({ required: true, index: true })
  orgId!: string;

  @Prop({ required: true })
  channelId!: string;

  @Prop({ required: true, min: 1 })
  seq!: number;

  @Prop({ required: true })
  clientMessageId!: string;

  @Prop({
    required: true,
    type: String,
    enum: ['USER', 'SYSTEM'],
    default: 'USER',
  })
  senderType!: string;

  @Prop({ required: true })
  senderId!: string;

  @Prop({ required: true })
  text!: string;

  @Prop({ type: [AttachmentSchema], default: [] })
  attachments!: Attachment[];

  @Prop({ type: [ReactionSchema], default: [] })
  reactions!: Reaction[];

  @Prop({ type: AcknowledgementSchema, default: () => ({}) })
  acknowledgement!: Acknowledgement;

  createdAt!: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// 채널별 메시지 순서 중복 방지
MessageSchema.index({ channelId: 1, seq: 1 }, { unique: true });

// 동일한 클라이언트 메시지의 중복 저장 방지
MessageSchema.index(
  { channelId: 1, clientMessageId: 1 },
  { unique: true },
);
