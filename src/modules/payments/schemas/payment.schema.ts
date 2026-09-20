import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PaymentTransactionStatus } from '../../../common/enums/payment-transaction-status.enum.js';
import { PaymentMethod } from '../../../common/enums/payment-method.enum.js';

export type PaymentDocument = HydratedDocument<Payment>;

@Schema({ timestamps: true })
export class Payment {
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
  orderId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  orderCode: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(PaymentMethod),
    required: true,
  })
  paymentMethod: PaymentMethod;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({
    type: String,
    enum: Object.values(PaymentTransactionStatus),
    default: PaymentTransactionStatus.PENDING,
  })
  status: PaymentTransactionStatus;

  @Prop()
  transactionId?: string; // mã giao dịch từ cổng thanh toán

  @Prop()
  paidAt?: Date;

  @Prop()
  expiresAt?: Date;

  @Prop({ type: Object })
  gatewayResponse?: Record<string, any>; // raw response để đối soát khi cần
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

PaymentSchema.index({ orderId: 1 }, { unique: true });
PaymentSchema.index({ userId: 1, createdAt: -1 });
