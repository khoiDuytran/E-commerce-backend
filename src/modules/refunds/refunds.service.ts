import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OrderStatus } from '../../common/enums/order-status.enum.js';
import { PaymentStatus } from '../../common/enums/payment-status.enum.js';
import { PaymentTransactionStatus } from '../../common/enums/payment-transaction-status.enum.js';
import { RefundStatus } from '../../common/enums/refund-status.enum.js';
import { Order, OrderDocument } from '../orders/schemas/order.schema.js';
import { Payment, PaymentDocument } from '../payments/schemas/payment.schema.js';
import { CreateRefundDto } from './dto/create-refund.dto.js';
import { UpdateRefundDto } from './dto/update-refund.dto.js';
import { Refund, RefundDocument } from './schemas/refund.schema.js';

@Injectable()
export class RefundsService {
  constructor(
    @InjectModel(Refund.name)
    private readonly refundModel: Model<RefundDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
  ) {}

  async create(userId: string, dto: CreateRefundDto) {
    const order = await this.orderModel.findOne({
      orderCode: dto.orderCode,
      user: userId,
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('Chỉ có thể hoàn hàng sau khi đơn đã giao');
    }

    const existing = await this.refundModel.findOne({ orderId: order._id });
    if (existing) throw new BadRequestException('Đơn hàng đã có yêu cầu hoàn');

    const refund = await this.refundModel.create({
      orderId: order._id,
      orderCode: order.orderCode,
      userId,
      reason: dto.reason,
      description: dto.description,
      refundAmount: order.total,
    });
    await this.orderModel.findByIdAndUpdate(order._id, {
      status: OrderStatus.RETURN_REQUESTED,
    });
    return refund;
  }

  async findOne(id: string, userId: string) {
    const refund = await this.refundModel.findOne({ _id: id, userId });
    if (!refund) throw new NotFoundException('Không tìm thấy yêu cầu hoàn');
    return refund;
  }

  async update(id: string, userId: string, dto: UpdateRefundDto) {
    const refund = await this.findOne(id, userId);
    const allowed: Record<RefundStatus, RefundStatus[]> = {
      [RefundStatus.REQUESTED]: [RefundStatus.APPROVED, RefundStatus.REJECTED],
      [RefundStatus.APPROVED]: [RefundStatus.RECEIVED],
      [RefundStatus.RECEIVED]: [RefundStatus.REFUNDED],
      [RefundStatus.REFUNDED]: [],
      [RefundStatus.REJECTED]: [],
    };
    if (!allowed[refund.status].includes(dto.status)) {
      throw new BadRequestException(
        `Không thể chuyển trạng thái từ ${refund.status} sang ${dto.status}`,
      );
    }

    refund.status = dto.status;
    refund.adminNote = dto.adminNote;
    if (dto.status === RefundStatus.REFUNDED) {
      refund.refundedAt = new Date();
      await this.orderModel.findByIdAndUpdate(refund.orderId, {
        status: OrderStatus.REFUNDED,
        paymentStatus: PaymentStatus.REFUNDED,
      });
      await this.paymentModel.findOneAndUpdate(
        { orderId: refund.orderId },
        { status: PaymentTransactionStatus.REFUNDED },
      );
    } else if (dto.status === RefundStatus.APPROVED) {
      await this.orderModel.findByIdAndUpdate(refund.orderId, {
        status: OrderStatus.RETURN_APPROVED,
      });
    } else if (dto.status === RefundStatus.RECEIVED) {
      await this.orderModel.findByIdAndUpdate(refund.orderId, {
        status: OrderStatus.RETURN_RECEIVED,
      });
    } else if (dto.status === RefundStatus.REJECTED) {
      await this.orderModel.findByIdAndUpdate(refund.orderId, {
        status: OrderStatus.RETURN_REJECTED,
      });
    }

    return refund.save();
  }
}