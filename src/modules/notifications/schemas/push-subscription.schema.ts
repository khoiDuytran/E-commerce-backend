import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type PushSubscriptionDocument = HydratedDocument<PushSubscription>;

@Schema({ _id: false })
export class PushSubscriptionKeys {
  @Prop({ required: true })
  p256dh: string;

  @Prop({ required: true })
  auth: string;
}

const PushSubscriptionKeysSchema =
  SchemaFactory.createForClass(PushSubscriptionKeys);

/** Đăng ký Web Push của một trình duyệt. Một user có thể có nhiều trình duyệt. */
@Schema({ timestamps: true })
export class PushSubscription {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ required: true, trim: true })
  endpoint: string;

  @Prop({ type: PushSubscriptionKeysSchema, required: true })
  keys: PushSubscriptionKeys;
}

export const PushSubscriptionSchema =
  SchemaFactory.createForClass(PushSubscription);

PushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
PushSubscriptionSchema.index({ user: 1 });
