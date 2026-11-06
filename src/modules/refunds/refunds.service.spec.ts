import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderStatus } from '../../common/enums/order-status.enum.js';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';
import { PaymentStatus } from '../../common/enums/payment-status.enum.js';
import { PaymentTransactionStatus } from '../../common/enums/payment-transaction-status.enum.js';
import { RefundStatus } from '../../common/enums/refund-status.enum.js';
import { RefundsService } from './refunds.service.js';

const USER_ID = '507f1f77bcf86cd799439011';
const REFUND_ID = '507f1f77bcf86cd799439012';

describe('RefundsService', () => {
  let refundModel: any;
  let orderModel: any;
  let paymentModel: any;
  let productModel: any;
  let variantModel: any;
  let vnpayService: any;
  let service: RefundsService;

  const mockRefund = (status: RefundStatus) => {
    refundModel.findById.mockResolvedValue({
      _id: REFUND_ID,
      orderId: 'order-1',
      status,
    });
    refundModel.findOneAndUpdate.mockResolvedValue({
      _id: REFUND_ID,
      orderId: 'order-1',
      refundAmount: 100000,
      save: vi.fn(),
    });
  };

  let notificationsService: any;

  beforeEach(() => {
    notificationsService = {
      notifyOrderStatus: vi.fn().mockResolvedValue(undefined),
      notifyPaymentStatus: vi.fn().mockResolvedValue(undefined),
      notifyAdminsNewOrder: vi.fn().mockResolvedValue(undefined),
      notifyAdminsLowStock: vi.fn().mockResolvedValue(undefined),
      notifyAdminsRefundRequested: vi.fn().mockResolvedValue(undefined),
      notifyAdminsManualRefund: vi.fn().mockResolvedValue(undefined),
    };
    refundModel = {
      findOne: vi.fn(),
      findById: vi.fn(),
      findOneAndUpdate: vi.fn(),
      updateOne: vi.fn(),
      create: vi.fn().mockResolvedValue({}),
    };
    orderModel = { findOne: vi.fn(), findByIdAndUpdate: vi.fn() };
    paymentModel = { findOne: vi.fn(), findOneAndUpdate: vi.fn() };
    productModel = { findByIdAndUpdate: vi.fn() };
    variantModel = { findByIdAndUpdate: vi.fn() };
    vnpayService = {
      refund: vi.fn().mockResolvedValue({ vnp_ResponseCode: '00' }),
    };
    service = new RefundsService(
      refundModel,
      orderModel,
      paymentModel,
      productModel,
      variantModel,
      vnpayService,
      notificationsService,
    );
  });

  it('rejects a refund request for an unpaid delivered order', async () => {
    orderModel.findOne.mockResolvedValue({
      status: OrderStatus.DELIVERED,
      paymentStatus: PaymentStatus.UNPAID,
    });

    await expect(
      service.create(USER_ID, { orderCode: 'ORD-1', reason: 'x' } as any),
    ).rejects.toThrow(BadRequestException);
    expect(refundModel.create).not.toHaveBeenCalled();
  });

  it('notifies the customer with the new order status', async () => {
    mockRefund(RefundStatus.REQUESTED);
    orderModel.findByIdAndUpdate.mockResolvedValue({
      _id: 'order-1',
      user: 'user-1',
      orderCode: 'ORD-1',
      status: OrderStatus.RETURN_REQUESTED,
    });

    await service.update(REFUND_ID, { status: RefundStatus.REJECTED });

    expect(notificationsService.notifyOrderStatus).toHaveBeenCalledWith({
      _id: 'order-1',
      user: 'user-1',
      orderCode: 'ORD-1',
      status: OrderStatus.RETURN_REJECTED,
    });
  });

  it('restocks once when returned goods are received', async () => {
    mockRefund(RefundStatus.APPROVED);
    orderModel.findByIdAndUpdate.mockResolvedValue({
      items: [
        { product: 'p1', quantity: 2 },
        { product: 'p2', variant: 'v2', quantity: 1 },
      ],
    });

    variantModel.findByIdAndUpdate.mockResolvedValue({ isActive: true });

    await service.update(REFUND_ID, { status: RefundStatus.RECEIVED });

    expect(productModel.findByIdAndUpdate).toHaveBeenCalledWith('p1', {
      $inc: { stock: 2, soldCount: -2 },
    });
    expect(variantModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'v2',
      { $inc: { stock: 1 } },
      { returnDocument: 'after' },
    );
    // Tồn kho sản phẩm có biến thể là tổng các biến thể nên cộng theo
    expect(productModel.findByIdAndUpdate).toHaveBeenCalledWith('p2', {
      $inc: { stock: 1, soldCount: -1 },
    });
  });

  it('does not add an inactive variant back to the product total', async () => {
    mockRefund(RefundStatus.APPROVED);
    orderModel.findByIdAndUpdate.mockResolvedValue({
      items: [{ product: 'p2', variant: 'v2', quantity: 1 }],
    });
    variantModel.findByIdAndUpdate.mockResolvedValue({ isActive: false });

    await service.update(REFUND_ID, { status: RefundStatus.RECEIVED });

    expect(productModel.findByIdAndUpdate).toHaveBeenCalledWith('p2', {
      $inc: { soldCount: -1 },
    });
  });

  it('does nothing when it loses a concurrent status change', async () => {
    mockRefund(RefundStatus.APPROVED);
    refundModel.findOneAndUpdate.mockResolvedValue(null);

    await expect(
      service.update(REFUND_ID, { status: RefundStatus.RECEIVED }),
    ).rejects.toThrow(BadRequestException);

    expect(orderModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(productModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(notificationsService.notifyOrderStatus).not.toHaveBeenCalled();
  });

  it('calls VNPay before marking a VNPay order as refunded', async () => {
    mockRefund(RefundStatus.RECEIVED);
    paymentModel.findOne.mockResolvedValue({
      orderCode: 'ORD-1',
      paymentMethod: PaymentMethod.VNPAY,
      status: PaymentTransactionStatus.SUCCESS,
      transactionId: 'TXN-1',
      gatewayResponse: { vnp_PayDate: '20260101120000' },
    });

    await service.update(REFUND_ID, { status: RefundStatus.REFUNDED });

    expect(vnpayService.refund).toHaveBeenCalledWith({
      orderCode: 'ORD-1',
      amount: 100000,
      transactionNo: 'TXN-1',
      transactionDate: '20260101120000',
      createdBy: 'admin',
    });
    expect(orderModel.findByIdAndUpdate).toHaveBeenCalledWith('order-1', {
      status: OrderStatus.REFUNDED,
      paymentStatus: PaymentStatus.REFUNDED,
    });
  });

  it('reverts the status when VNPay rejects the refund', async () => {
    mockRefund(RefundStatus.RECEIVED);
    paymentModel.findOne.mockResolvedValue({
      orderCode: 'ORD-1',
      paymentMethod: PaymentMethod.VNPAY,
      status: PaymentTransactionStatus.SUCCESS,
    });
    vnpayService.refund.mockRejectedValue(new Error('rejected'));

    await expect(
      service.update(REFUND_ID, { status: RefundStatus.REFUNDED }),
    ).rejects.toThrow(BadGatewayException);

    expect(refundModel.updateOne).toHaveBeenCalledWith(
      { _id: REFUND_ID },
      { status: RefundStatus.RECEIVED, $unset: { refundedAt: 1 } },
    );
    expect(orderModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(notificationsService.notifyOrderStatus).not.toHaveBeenCalled();
  });

  it('does not call VNPay for a COD refund', async () => {
    mockRefund(RefundStatus.RECEIVED);
    paymentModel.findOne.mockResolvedValue({
      paymentMethod: PaymentMethod.COD,
      status: PaymentTransactionStatus.SUCCESS,
    });

    await service.update(REFUND_ID, { status: RefundStatus.REFUNDED });

    expect(vnpayService.refund).not.toHaveBeenCalled();
    expect(paymentModel.findOneAndUpdate).toHaveBeenCalled();
  });
});
