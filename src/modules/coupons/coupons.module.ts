import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CouponService } from './coupons.service.js';
import { CouponController } from './coupons.controller.js';
import { Coupon, CouponSchema } from './schemas/coupon.schema.js';

@Module({
  imports: [
    NotificationsModule,
    MongooseModule.forFeature([{ name: Coupon.name, schema: CouponSchema }]),
  ],
  controllers: [CouponController],
  providers: [CouponService],
  exports: [CouponService],
})
export class CouponModule {}
