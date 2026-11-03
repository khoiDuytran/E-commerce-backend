import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PaymentsService } from './payments.service.js';
import { PaymentsController } from './payments.controller.js';
import { Payment, PaymentSchema } from './schemas/payment.schema.js';
import { Order, OrderSchema } from '../orders/schemas/order.schema.js';
import { VnpayModule } from '../../integrations/vnpay/vnpay.module.js';

@Module({
  imports: [
    NotificationsModule,
    VnpayModule,
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
