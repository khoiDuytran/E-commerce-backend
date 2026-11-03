import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { NotificationType } from '../../../common/enums/notification-type.enum.js';

export type NotificationDocument = HydratedDocument<Notification>;

// Thông báo cũ hơn 90 ngày được MongoDB tự xoá
export const NOTIFICATION_TTL_SECONDS = 90 * 24 * 60 * 60;

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(NotificationType),
    required: true,
  })
  type: NotificationType;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  message: string;

  // Đường dẫn tương đối trên frontend để mở khi bấm vào thông báo
  @Prop({ trim: true })
  link?: string;

  // Dữ liệu kèm theo, ví dụ { orderId, orderCode, status }
  @Prop({ type: Object, default: {} })
  data: Record<string, unknown>;

  @Prop({ default: false })
  isRead: boolean;

  @Prop()
  readAt?: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ user: 1, createdAt: -1 });
NotificationSchema.index({ user: 1, isRead: 1 });
NotificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: NOTIFICATION_TTL_SECONDS },
);
