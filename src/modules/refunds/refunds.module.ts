import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { Order, OrderSchema } from '../orders/schemas/order.schema.js';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema.js';
import { Product, ProductSchema } from '../products/schemas/product.schema.js';
import {
  ProductVariant,
  ProductVariantSchema,
} from '../product-variants/schemas/product-variant.schema.js';
import { VnpayModule } from '../../integrations/vnpay/vnpay.module.js';
import { RefundsController } from './refunds.controller.js';
import { RefundsService } from './refunds.service.js';
import { Refund, RefundSchema } from './schemas/refund.schema.js';

@Module({
  imports: [
    NotificationsModule,
    VnpayModule,
    MongooseModule.forFeature([
      { name: Refund.name, schema: RefundSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Product.name, schema: ProductSchema },
      { name: ProductVariant.name, schema: ProductVariantSchema },
    ]),
  ],
  controllers: [RefundsController],
  providers: [RefundsService],
})
export class RefundsModule {}
