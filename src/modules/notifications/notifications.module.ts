import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import {
  Wishlist,
  WishlistSchema,
} from '../wishlist/schemas/wishlist.schema.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsGateway } from './notifications.gateway.js';
import { NotificationsService } from './notifications.service.js';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema.js';
import {
  PushSubscription,
  PushSubscriptionSchema,
} from './schemas/push-subscription.schema.js';
import { WebPushService } from './web-push.service.js';

@Module({
  imports: [
    // Gateway chỉ cần xác thực access token, dùng cùng secret với AuthModule
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: PushSubscription.name, schema: PushSubscriptionSchema },
      { name: User.name, schema: UserSchema },
      { name: Wishlist.name, schema: WishlistSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway, WebPushService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
