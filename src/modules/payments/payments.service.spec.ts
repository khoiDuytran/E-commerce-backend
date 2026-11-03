import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderStatus } from '../../common/enums/order-status.enum.js';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';
import { PaymentStatus } from '../../common/enums/payment-status.enum.js';
import { PaymentTransactionStatus } from '../../common/enums/payment-transaction-status.enum.js';
import { PaymentsService } from './payments.service.js';

const USER_ID = '507f1f77bcf86cd799439011';
const PAYMENT_ID = '507f1f77bcf86cd799439012';

const makePayment = (overrides = {}) => ({
  _id: PAYMENT_ID,
  orderId: 'order-1',
  orderCode: 'ORD-1',
  userId: USER_ID,
  amount: 84999,
  paymentMethod: PaymentMethod.VNPAY,
  status: PaymentTransactionStatus.PENDING,
  save: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const successQuery = {
  vnp_TxnRef: 'ORD-1',
  vnp_Amount: '8499900',
  vnp_ResponseCode: '00',
  vnp_TransactionStatus: '00',
  vnp_TransactionNo: 'TXN-1',
};

describe('PaymentsService', () => {
  let paymentModel: any;
  let orderModel: any;
  let vnpayService: any;
  let service: PaymentsService;

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
    paymentModel = { findOne: vi.fn(), findById: vi.fn() };
    orderModel = { findOneAndUpdate: vi.fn(), findById: vi.fn() };
    vnpayService = {
      verifyResponse: vi.fn().mockReturnValue(true),
      getPaymentInfo: vi.fn().mockReturnValue({ checkoutUrl: 'https://pay' }),
    };
    service = new PaymentsService(
      paymentModel,
      orderModel,
      vnpayService,
      notificationsService,
    );
  });

  describe('VNPay IPN', () => {
    it('rejects an invalid signature without touching data', async () => {
      vnpayService.verifyResponse.mockReturnValue(false);
      const result = await service.handleVnpayIpn(successQuery);
      expect(result.RspCode).toBe('97');
      expect(paymentModel.findOne).not.toHaveBeenCalled();
    });

    it('rejects a mismatched amount', async () => {
      const payment = makePayment();
      paymentModel.findOne.mockResolvedValue(payment);
      const result = await service.handleVnpayIpn({
        ...successQuery,
        vnp_Amount: '100',
      });
      expect(result.RspCode).toBe('04');
      expect(payment.save).not.toHaveBeenCalled();
    });

    it('accepts legacy fractional amounts without float mismatch', async () => {
      const payment = makePayment({ amount: 84999.15000000001 });
      paymentModel.findOne.mockResolvedValue(payment);
      orderModel.findOneAndUpdate.mockResolvedValue({ _id: 'order-1' });
      const result = await service.handleVnpayIpn({
        ...successQuery,
        vnp_Amount: '8499915',
      });
      expect(result.RspCode).toBe('00');
    });

    it('marks an open order as paid', async () => {
      const payment = makePayment();
      paymentModel.findOne.mockResolvedValue(payment);
      const before = { _id: 'order-1', paymentStatus: PaymentStatus.UNPAID };
      orderModel.findOneAndUpdate.mockResolvedValue(before);

      const result = await service.handleVnpayIpn(successQuery);

      expect(result.RspCode).toBe('00');
      expect(payment.status).toBe(PaymentTransactionStatus.SUCCESS);
      expect(orderModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: 'order-1',
          status: { $nin: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] },
        },
        { paymentStatus: PaymentStatus.PAID },
        { returnDocument: 'before' },
      );
      expect(notificationsService.notifyPaymentStatus).toHaveBeenCalledWith(
        before,
        PaymentStatus.PAID,
      );
    });

    it('does not notify again when a concurrent IPN already marked the order paid', async () => {
      paymentModel.findOne.mockResolvedValue(makePayment());
      orderModel.findOneAndUpdate.mockResolvedValue({
        _id: 'order-1',
        paymentStatus: PaymentStatus.PAID,
      });

      const result = await service.handleVnpayIpn(successQuery);

      expect(result.RspCode).toBe('00');
      expect(notificationsService.notifyPaymentStatus).not.toHaveBeenCalled();
    });

    it('flags manual refund when money arrives for a closed order', async () => {
      const payment: any = makePayment({
        status: PaymentTransactionStatus.EXPIRED,
      });
      paymentModel.findOne.mockResolvedValue(payment);
      orderModel.findOneAndUpdate.mockResolvedValue(null);

      const result = await service.handleVnpayIpn(successQuery);

      expect(result.RspCode).toBe('00');
      expect(payment.status).toBe(PaymentTransactionStatus.SUCCESS);
      expect(payment.requiresManualRefund).toBe(true);
      expect(notificationsService.notifyPaymentStatus).not.toHaveBeenCalled();
      expect(
        notificationsService.notifyAdminsManualRefund,
      ).toHaveBeenCalledWith(
        payment.orderCode,
        payment.amount,
        expect.any(String),
      );
    });

    it('is idempotent for an already successful payment', async () => {
      const payment = makePayment({
        status: PaymentTransactionStatus.SUCCESS,
      });
      paymentModel.findOne.mockResolvedValue(payment);

      const result = await service.handleVnpayIpn(successQuery);

      expect(result.RspCode).toBe('00');
      expect(payment.save).not.toHaveBeenCalled();
      expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('records a failed payment without paying the order', async () => {
      const payment = makePayment();
      paymentModel.findOne.mockResolvedValue(payment);

      await service.handleVnpayIpn({ ...successQuery, vnp_ResponseCode: '24' });

      expect(payment.status).toBe(PaymentTransactionStatus.FAILED);
      expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('retry', () => {
    it.each([OrderStatus.CANCELLED, OrderStatus.REFUNDED])(
      'rejects retry for a %s order',
      async (status) => {
        const payment = makePayment({
          status: PaymentTransactionStatus.EXPIRED,
        });
        paymentModel.findById.mockResolvedValue(payment);
        orderModel.findById.mockResolvedValue({
          status,
          paymentStatus: PaymentStatus.UNPAID,
        });

        await expect(service.retry(PAYMENT_ID, USER_ID)).rejects.toThrow(
          BadRequestException,
        );
        expect(payment.save).not.toHaveBeenCalled();
      },
    );

    it('issues a new checkout link for an open unpaid order', async () => {
      const payment = makePayment({ status: PaymentTransactionStatus.FAILED });
      paymentModel.findById.mockResolvedValue(payment);
      orderModel.findById.mockResolvedValue({
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.UNPAID,
      });

      const result: any = await service.retry(PAYMENT_ID, USER_ID);

      expect(payment.status).toBe(PaymentTransactionStatus.PENDING);
      expect(result.paymentInfo.checkoutUrl).toBe('https://pay');
    });
  });

  it('does not expose a checkout link once the payment is no longer pending', async () => {
    paymentModel.findById.mockResolvedValue(
      makePayment({ status: PaymentTransactionStatus.EXPIRED }),
    );
    const result: any = await service.findOne(PAYMENT_ID, USER_ID);
    expect(result.paymentInfo).toBeUndefined();
  });
});
