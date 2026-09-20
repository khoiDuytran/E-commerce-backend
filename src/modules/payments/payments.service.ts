import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { Order, OrderDocument } from '../orders/schemas/order.schema.js';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';
import { PaymentStatus } from '../../common/enums/payment-status.enum.js';
import { PaymentTransactionStatus } from '../../common/enums/payment-transaction-status.enum.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { Payment, PaymentDocument } from './schemas/payment.schema.js';
import { VnpayService } from '../../integrations/vnpay/vnpay.service.js';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    private readonly vnpayService: VnpayService,
  ) {}

  private paymentView(payment: PaymentDocument) {
    return payment.paymentMethod === PaymentMethod.VNPAY
      ? {
          payment,
          paymentInfo: this.vnpayService.getPaymentInfo(
            payment.orderCode,
            payment.amount,
          ),
        }
      : { payment };
  }

  private async ownedPaymentOrThrow(id: string, userId: string) {
    if (!mongoose.isValidObjectId(id))
      throw new BadRequestException('payment id không hợp lệ');
    const payment = await this.paymentModel.findById(id);
    if (!payment) throw new NotFoundException('Không tìm thấy payment');
    if (payment.userId.toString() !== userId)
      throw new ForbiddenException('Bạn không có quyền truy cập payment này');
    return payment;
  }

  async create(userId: string, createPaymentDto: CreatePaymentDto) {
    const order = await this.orderModel.findOne({
      _id: createPaymentDto.orderId,
      user: userId,
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    const payment = await this.paymentModel.findOneAndUpdate(
      { orderId: order._id },
      {
        $setOnInsert: {
          orderId: order._id,
          orderCode: order.orderCode,
          userId,
          paymentMethod: createPaymentDto.paymentMethod,
          amount: order.total,
          expiresAt:
            createPaymentDto.paymentMethod === PaymentMethod.VNPAY
              ? new Date(Date.now() + 30 * 60 * 1000)
              : undefined,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return this.paymentView(payment);
  }

  async createForOrder(
    userId: string,
    orderId: string,
    orderCode: string,
    amount: number,
    paymentMethod: PaymentMethod,
  ) {
    const payment = await this.paymentModel.create({
      orderId,
      orderCode,
      userId,
      paymentMethod,
      amount,
      expiresAt:
        paymentMethod === PaymentMethod.VNPAY
          ? new Date(Date.now() + 30 * 60 * 1000)
          : undefined,
    });
    return this.paymentView(payment);
  }

  async findOne(id: string, userId: string) {
    return this.paymentView(await this.ownedPaymentOrThrow(id, userId));
  }

  async findByOrder(orderId: string, userId: string) {
    const payment = await this.paymentModel.findOne({ orderId, userId });
    if (!payment) throw new NotFoundException('Không tìm thấy payment');
    return this.paymentView(payment);
  }

  async retry(id: string, userId: string) {
    const payment = await this.ownedPaymentOrThrow(id, userId);
    if (payment.status === PaymentTransactionStatus.SUCCESS) {
      throw new BadRequestException('Payment đã thành công, không thể retry');
    }
    payment.status = PaymentTransactionStatus.PENDING;
    payment.transactionId = undefined;
    payment.paidAt = undefined;
    payment.expiresAt =
      payment.paymentMethod === PaymentMethod.VNPAY
        ? new Date(Date.now() + 30 * 60 * 1000)
        : undefined;
    await payment.save();
    return this.paymentView(payment);
  }

  async handleVnpayIpn(query: Record<string, string>) {
    return this.processVnpayResponse(query);
  }

  async handleVnpayReturn(query: Record<string, string>) {
    const result = await this.processVnpayResponse(query);
    return {
      ...result,
      orderCode: query.vnp_TxnRef,
      responseCode: query.vnp_ResponseCode,
    };
  }

  private async processVnpayResponse(query: Record<string, string>) {
    if (!this.vnpayService.verifyResponse(query)) {
      return { RspCode: '97', Message: 'Invalid signature' };
    }

    const payment = await this.paymentModel.findOne({
      orderCode: query.vnp_TxnRef,
    });
    if (!payment) return { RspCode: '01', Message: 'Order not found' };

    const amount = Number(query.vnp_Amount) / 100;
    if (!Number.isFinite(amount) || amount !== payment.amount) {
      return { RspCode: '04', Message: 'Invalid amount' };
    }

    if (payment.status === PaymentTransactionStatus.SUCCESS) {
      return { RspCode: '00', Message: 'Confirm Success' };
    }

    const isSuccess =
      query.vnp_ResponseCode === '00' && query.vnp_TransactionStatus === '00';
    payment.status = isSuccess
      ? PaymentTransactionStatus.SUCCESS
      : PaymentTransactionStatus.FAILED;
    payment.transactionId = query.vnp_TransactionNo;
    payment.paidAt = isSuccess ? new Date() : undefined;
    payment.gatewayResponse = query;
    await payment.save();

    if (isSuccess) {
      await this.orderModel.findByIdAndUpdate(payment.orderId, {
        paymentStatus: PaymentStatus.PAID,
      });
    }

    return { RspCode: '00', Message: 'Confirm Success' };
  }
}
