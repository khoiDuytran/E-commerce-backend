import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { Order, OrderDocument } from '../orders/schemas/order.schema.js';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';
import { PaymentStatus } from '../../common/enums/payment-status.enum.js';
import { PaymentTransactionStatus } from '../../common/enums/payment-transaction-status.enum.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import {
  Payment,
  PaymentDocument,
  paymentOrderFilter,
} from './schemas/payment.schema.js';
import { VnpayService } from '../../integrations/vnpay/vnpay.service.js';
import { OrderStatus } from '../../common/enums/order-status.enum.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const CLOSED_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
];

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    private readonly vnpayService: VnpayService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private assertOrderPayable(order: OrderDocument) {
    if (CLOSED_ORDER_STATUSES.includes(order.status)) {
      throw new BadRequestException('Đơn hàng đã đóng, không thể thanh toán');
    }
    if (order.paymentStatus !== PaymentStatus.UNPAID) {
      throw new BadRequestException('Đơn hàng đã được thanh toán');
    }
  }

  private paymentView(payment: PaymentDocument) {
    // Chỉ cấp link thanh toán khi giao dịch còn đang chờ
    return payment.paymentMethod === PaymentMethod.VNPAY &&
      payment.status === PaymentTransactionStatus.PENDING
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
    this.assertOrderPayable(order);
    const payment = await this.paymentModel.findOneAndUpdate(
      paymentOrderFilter(order._id),
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
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
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
    if (!mongoose.isValidObjectId(orderId))
      throw new BadRequestException('order id không hợp lệ');
    const payment = await this.paymentModel.findOne({ orderId, userId });
    if (!payment) throw new NotFoundException('Không tìm thấy payment');
    return this.paymentView(payment);
  }

  async retry(id: string, userId: string) {
    const payment = await this.ownedPaymentOrThrow(id, userId);
    if (
      payment.status === PaymentTransactionStatus.SUCCESS ||
      payment.status === PaymentTransactionStatus.REFUNDED
    ) {
      throw new BadRequestException('Payment đã thành công, không thể retry');
    }
    const order = await this.orderModel.findById(payment.orderId);
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    this.assertOrderPayable(order);
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

    // So sánh theo đơn vị của VNPay (amount * 100) để tránh sai số số thực
    if (Number(query.vnp_Amount) !== Math.round(payment.amount * 100)) {
      return { RspCode: '04', Message: 'Invalid amount' };
    }

    if (
      payment.status === PaymentTransactionStatus.SUCCESS ||
      payment.status === PaymentTransactionStatus.REFUNDED
    ) {
      return { RspCode: '00', Message: 'Confirm Success' };
    }

    const isSuccess =
      query.vnp_ResponseCode === '00' && query.vnp_TransactionStatus === '00';

    let paidOrder: OrderDocument | null = null;
    let needsManualRefund = false;
    if (isSuccess) {
      // Cùng điều kiện với cancel() trên document order: chỉ 1 trong 2 thắng.
      // Lấy bản trước khi cập nhật để biết request nào thật sự chuyển sang PAID.
      const order = await this.orderModel.findOneAndUpdate(
        { _id: payment.orderId, status: { $nin: CLOSED_ORDER_STATUSES } },
        { paymentStatus: PaymentStatus.PAID },
        { returnDocument: 'before' },
      );
      if (order && order.paymentStatus !== PaymentStatus.PAID) {
        paidOrder = order;
      }
      // Tiền đã bị trừ nên vẫn ghi nhận giao dịch, nhưng không mở lại đơn đã đóng
      if (!order) {
        payment.requiresManualRefund = true;
        needsManualRefund = true;
        this.logger.error(
          `Đơn ${payment.orderCode} đã đóng nhưng nhận được tiền VNPay (${query.vnp_TransactionNo}), cần hoàn tiền thủ công`,
        );
      }
    }

    payment.status = isSuccess
      ? PaymentTransactionStatus.SUCCESS
      : PaymentTransactionStatus.FAILED;
    payment.transactionId = query.vnp_TransactionNo;
    payment.paidAt = isSuccess ? new Date() : undefined;
    payment.gatewayResponse = query;
    await payment.save();

    // IPN có thể bị gọi lại: chỉ request chuyển đơn sang PAID mới gửi thông báo
    if (paidOrder) {
      await this.notificationsService.notifyPaymentStatus(
        paidOrder,
        PaymentStatus.PAID,
      );
    }
    // IPN lặp lại sẽ dừng ở bước kiểm tra SUCCESS phía trên nên admin chỉ nhận một lần
    if (needsManualRefund) {
      await this.notificationsService.notifyAdminsManualRefund(
        payment.orderCode,
        payment.amount,
        query.vnp_TransactionNo,
      );
    }

    return { RspCode: '00', Message: 'Confirm Success' };
  }
}
