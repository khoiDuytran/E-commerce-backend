import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { RefundStatus } from '../../../common/enums/refund-status.enum.js';

export type RefundDocument = HydratedDocument<Refund>;

@Schema({ timestamps: true })
export class Refund {
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
  orderId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  orderCode: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 500 })
  reason: string;

  @Prop({ trim: true, maxlength: 2000 })
  description?: string;

  @Prop({ type: String, enum: Object.values(RefundStatus), default: RefundStatus.REQUESTED })
  status: RefundStatus;

  @Prop({ required: true, min: 0 })
  refundAmount: number;

  @Prop({ trim: true, maxlength: 500 })
  adminNote?: string;

  @Prop()
  refundedAt?: Date;
}

export const RefundSchema = SchemaFactory.createForClass(Refund);

RefundSchema.index({ orderId: 1 }, { unique: true });
RefundSchema.index({ userId: 1, createdAt: -1 });