import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AddressesModule } from '../addresses/addresses.module.js';
import { Coupon, CouponSchema } from '../coupons/schemas/coupon.schema.js';
import { Product, ProductSchema } from '../products/schemas/product.schema.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { Order, OrderSchema } from './schemas/order.schema.js';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema.js';
import { PaymentsModule } from '../payments/payments.module.js';

@Module({
  imports: [
    PaymentsModule,
    AddressesModule,
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Coupon.name, schema: CouponSchema },
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
