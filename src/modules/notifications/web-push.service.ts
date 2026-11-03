import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import webpush from 'web-push';
import { SubscribePushDto } from './dto/subscribe-push.dto.js';
import {
  PushSubscription,
  PushSubscriptionDocument,
} from './schemas/push-subscription.schema.js';

export interface PushPayload {
  title: string;
  body: string;
  link?: string;
}

// Gửi song song tối đa từng ấy trình duyệt để không nghẽn khi gửi cho nhiều user
const SEND_CONCURRENCY = 20;

/** Gửi Web Push. Tự tắt khi chưa cấu hình VAPID. */
@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private readonly publicKey?: string;

  constructor(
    configService: ConfigService,
    @InjectModel(PushSubscription.name)
    private readonly subscriptionModel: Model<PushSubscriptionDocument>,
  ) {
    const publicKey = configService.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = configService.get<string>('VAPID_PRIVATE_KEY');
    const subject = configService.get<string>('VAPID_SUBJECT');
    if (publicKey && privateKey && subject) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.publicKey = publicKey;
    } else {
      this.logger.warn(
        'Chưa cấu hình VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT: tắt Web Push',
      );
    }
  }

  get enabled() {
    return !!this.publicKey;
  }

  getPublicKey() {
    return { enabled: this.enabled, publicKey: this.publicKey ?? null };
  }

  async subscribe(userId: string, dto: SubscribePushDto) {
    // Cùng trình duyệt đăng nhập tài khoản khác thì chuyển đăng ký sang user mới
    await this.subscriptionModel.findOneAndUpdate(
      { endpoint: dto.endpoint },
      { user: userId, endpoint: dto.endpoint, keys: dto.keys },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    return { message: 'Đã bật thông báo trình duyệt' };
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.subscriptionModel.deleteOne({ user: userId, endpoint });
    return { message: 'Đã tắt thông báo trình duyệt' };
  }

  /** Gửi tới mọi trình duyệt của các user. Không throw. */
  async sendToUsers(userIds: string[], payload: PushPayload) {
    if (!this.enabled || userIds.length === 0) return;
    try {
      const subscriptions = await this.subscriptionModel
        .find({ user: { $in: userIds } })
        .lean();
      const body = JSON.stringify(payload);
      for (let i = 0; i < subscriptions.length; i += SEND_CONCURRENCY) {
        await Promise.all(
          subscriptions
            .slice(i, i + SEND_CONCURRENCY)
            .map((subscription) => this.sendOne(subscription, body)),
        );
      }
    } catch (error) {
      this.logger.error(
        'Không gửi được Web Push',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async sendOne(
    subscription: {
      _id: Types.ObjectId;
      endpoint: string;
      keys: webpush.PushSubscription['keys'];
    },
    body: string,
  ) {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: subscription.keys },
        body,
        { TTL: 24 * 60 * 60 },
      );
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      // Trình duyệt đã huỷ đăng ký: xoá để không gửi lại
      if (statusCode === 404 || statusCode === 410) {
        await this.subscriptionModel.deleteOne({ _id: subscription._id });
        return;
      }
      this.logger.warn(
        `Web Push lỗi (${statusCode ?? 'không rõ'}) tới ${new URL(subscription.endpoint).host}`,
      );
    }
  }
}
