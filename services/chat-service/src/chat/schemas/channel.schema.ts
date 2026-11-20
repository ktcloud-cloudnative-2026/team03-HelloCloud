
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ChannelDocument = HydratedDocument<Channel>;

export enum ChannelType {
  NORMAL = 'NORMAL',
  DECISION = 'DECISION',
}

@Schema({
  collection: 'channels',
  timestamps: true,
  versionKey: false,
})
export class Channel {
  _id!: Types.ObjectId;

  @Prop({ required: true, index: true, trim: true })
  orgId!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(ChannelType),
    default: ChannelType.NORMAL,
  })
  type!: ChannelType;

  @Prop({
    required: true,
    type: Number,
    default: 0,
    min: 0,
  })
  lastSeq!: number;

  @Prop({ required: true })
  createdBy!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ChannelSchema = SchemaFactory.createForClass(Channel);
