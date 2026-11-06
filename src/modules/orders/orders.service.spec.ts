import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscountType } from '../../common/enums/discount-type.enum.js';
import { OrderStatus } from '../../common/enums/order-status.enum.js';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';
import { PaymentStatus } from '../../common/enums/payment-status.enum.js';
import { PaymentTransactionStatus } from '../../common/enums/payment-transaction-status.enum.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { paymentOrderFilter } from '../payments/schemas/payment.schema.js';
import { OrdersService } from './orders.service.js';

const USER_ID = '507f1f77bcf86cd799439011';
const ORDER_ID = '507f1f77bcf86cd799439012';
const PRODUCT_ID = '507f1f77bcf86cd799439013';
const COUPON_ID = '507f1f77bcf86cd799439014';
const VARIANT_ID = '507f1f77bcf86cd799439015';

const shippingAddress = {
  fullName: 'A',
  phone: '0900000000',
  province: 'P',
  district: 'D',
  ward: 'W',
  detail: 'X',
};

describe('OrdersService', () => {
  let orderModel: any;
  let productModel: any;
  let couponModel: any;
  let paymentModel: any;
  let variantModel: any;
  let cartModel: any;
  let paymentsService: any;
  let service: OrdersService;

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
    orderModel = {
      findById: vi.fn(),
      findOneAndUpdate: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      findByIdAndDelete: vi.fn(),
      // Giả lập document: toObject không liệt kê để so sánh bằng nhau như object thường
      create: vi.fn(async (data) => {
        const doc = { ...data, _id: ORDER_ID };
        Object.defineProperty(doc, 'toObject', { value: () => ({ ...doc }) });
        return doc;
      }),
    };
    productModel = {
      findById: vi.fn().mockResolvedValue({
        name: 'P',
        basePrice: 99999,
        stock: 10,
        images: [],
        isActive: true,
      }),
      findOneAndUpdate: vi.fn().mockResolvedValue({}),
      findByIdAndUpdate: vi.fn().mockResolvedValue({}),
    };
    couponModel = {
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn().mockResolvedValue({}),
      findByIdAndUpdate: vi.fn().mockResolvedValue({}),
    };
    paymentModel = { findOne: vi.fn(), updateOne: vi.fn() };
    variantModel = {
      findOne: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      exists: vi.fn().mockResolvedValue(null),
    };
    cartModel = { updateOne: vi.fn() };
    paymentsService = {
      createForOrder: vi.fn().mockResolvedValue({ payment: {} }),
    };
    service = new OrdersService(
      orderModel,
      productModel,
      couponModel,
      paymentModel,
      variantModel,
      cartModel,
      {} as any,
      paymentsService,
      notificationsService,
    );
  });

  const createDto = (extra = {}) =>
    ({
      items: [{ product: PRODUCT_ID, quantity: 1 }],
      shippingAddress,
      paymentMethod: PaymentMethod.VNPAY,
      ...extra,
    }) as any;

  describe('create', () => {
    it('rounds percent discounts to whole VND', async () => {
      couponModel.findOne.mockResolvedValue({
        discountType: DiscountType.PERCENT,
        discountValue: 15,
      });

      const { order } = await service.create(
        USER_ID,
        createDto({ coupon: COUPON_ID }),
      );

      expect(order.discount).toBe(15000);
      expect(order.total).toBe(84999);
      expect(Number.isInteger(order.total)).toBe(true);
      expect(notificationsService.notifyOrderStatus).toHaveBeenCalledWith(
        order,
      );
    });

    it('notifies admins about the new order', async () => {
      const { order } = await service.create(USER_ID, createDto());
      expect(notificationsService.notifyAdminsNewOrder).toHaveBeenCalledWith(
        order,
      );
      expect(notificationsService.notifyAdminsLowStock).toHaveBeenCalledWith(
        [],
      );
    });

    it('reports low stock only for the order that crosses the threshold', async () => {
      // Còn 6 trừ 2 = 4: vượt ngưỡng 5
      productModel.findOneAndUpdate.mockResolvedValueOnce({
        name: 'P',
        stock: 4,
      });
      await service.create(
        USER_ID,
        createDto({ items: [{ product: PRODUCT_ID, quantity: 2 }] }),
      );
      expect(
        notificationsService.notifyAdminsLowStock,
      ).toHaveBeenLastCalledWith([{ productName: 'P', stock: 4 }]);

      // Còn 4 trừ 1 = 3: đã dưới ngưỡng từ trước, không báo lại
      productModel.findOneAndUpdate.mockResolvedValueOnce({
        name: 'P',
        stock: 3,
      });
      await service.create(USER_ID, createDto());
      expect(
        notificationsService.notifyAdminsLowStock,
      ).toHaveBeenLastCalledWith([]);
    });

    it('rolls back stock and coupon when payment creation fails', async () => {
      couponModel.findOne.mockResolvedValue({
        discountType: DiscountType.PERCENT,
        discountValue: 15,
      });
      paymentsService.createForOrder.mockRejectedValue(new Error('boom'));

      await expect(
        service.create(USER_ID, createDto({ coupon: COUPON_ID })),
      ).rejects.toThrow('boom');

      expect(notificationsService.notifyOrderStatus).not.toHaveBeenCalled();
      expect(notificationsService.notifyAdminsNewOrder).not.toHaveBeenCalled();
      expect(notificationsService.notifyAdminsLowStock).not.toHaveBeenCalled();
      expect(orderModel.findByIdAndDelete).toHaveBeenCalledWith(ORDER_ID);
      expect(productModel.findByIdAndUpdate).toHaveBeenCalledWith(PRODUCT_ID, {
        $inc: { stock: 1, soldCount: -1 },
      });
      expect(couponModel.findByIdAndUpdate).toHaveBeenCalledWith(COUPON_ID, {
        $inc: { usedCount: -1 },
      });
    });

    describe('with a variant', () => {
      const variantDto = (quantity = 2) =>
        createDto({
          items: [{ product: PRODUCT_ID, variant: VARIANT_ID, quantity }],
        });

      beforeEach(() => {
        variantModel.findOne.mockResolvedValue({
          name: 'Đỏ / M',
          price: 50000,
          stock: 10,
          images: [],
          isActive: true,
        });
        variantModel.findOneAndUpdate = vi
          .fn()
          .mockResolvedValue({ name: 'Đỏ / M', stock: 8 });
      });

      it('reserves stock on the variant and keeps the product total in sync', async () => {
        await service.create(USER_ID, variantDto());

        expect(variantModel.findOneAndUpdate).toHaveBeenCalledWith(
          { _id: VARIANT_ID, product: PRODUCT_ID, stock: { $gte: 2 } },
          { $inc: { stock: -2 } },
          { returnDocument: 'after' },
        );
        // Không trừ có điều kiện ở sản phẩm: kho thật nằm ở biến thể
        expect(productModel.findOneAndUpdate).not.toHaveBeenCalled();
        expect(productModel.findByIdAndUpdate).toHaveBeenCalledWith(
          PRODUCT_ID,
          {
            $inc: { soldCount: 2, stock: -2 },
          },
        );
      });

      it('does not touch the product total when the variant is sold out', async () => {
        variantModel.findOneAndUpdate.mockResolvedValue(null);

        await expect(service.create(USER_ID, variantDto())).rejects.toThrow(
          BadRequestException,
        );
        expect(productModel.findByIdAndUpdate).not.toHaveBeenCalled();
        expect(orderModel.create).not.toHaveBeenCalled();
      });

      it('rolls back the variant and the product total when payment fails', async () => {
        paymentsService.createForOrder.mockRejectedValue(new Error('boom'));
        variantModel.findByIdAndUpdate.mockResolvedValue({ isActive: true });

        await expect(service.create(USER_ID, variantDto())).rejects.toThrow(
          'boom',
        );

        expect(variantModel.findByIdAndUpdate).toHaveBeenCalledWith(
          VARIANT_ID,
          { $inc: { stock: 2 } },
          { returnDocument: 'after' },
        );
        expect(productModel.findByIdAndUpdate).toHaveBeenLastCalledWith(
          PRODUCT_ID,
          { $inc: { stock: 2, soldCount: -2 } },
        );
      });
    });

    describe('cost snapshot', () => {
      const savedItems = () => orderModel.create.mock.calls[0][0].items;

      it('stores the product cost and hides it from the response', async () => {
        productModel.findById.mockResolvedValue({
          name: 'P',
          basePrice: 99999,
          costPrice: 60000,
          stock: 10,
          images: [],
          isActive: true,
        });

        const { order } = await service.create(USER_ID, createDto());

        expect(productModel.findById).toHaveBeenCalledWith(
          PRODUCT_ID,
          '+costPrice',
        );
        expect(savedItems()[0].costPrice).toBe(60000);
        // Khách nhận lại đơn vừa tạo: không được thấy giá vốn
        expect(order.items[0]).not.toHaveProperty('costPrice');
      });

      it('prefers the variant cost and falls back to the product cost', async () => {
        productModel.findById.mockResolvedValue({
          name: 'P',
          basePrice: 99999,
          costPrice: 60000,
          images: [],
          isActive: true,
        });
        variantModel.findOne
          .mockResolvedValueOnce({
            name: 'A',
            price: 50000,
            costPrice: 30000,
            stock: 5,
            isActive: true,
          })
          .mockResolvedValueOnce({
            name: 'B',
            price: 50000,
            stock: 5,
            isActive: true,
          });
        variantModel.findOneAndUpdate = vi
          .fn()
          .mockResolvedValue({ name: 'A', stock: 4 });

        await service.create(
          USER_ID,
          createDto({
            items: [
              { product: PRODUCT_ID, variant: VARIANT_ID, quantity: 1 },
              {
                product: PRODUCT_ID,
                variant: '507f1f77bcf86cd799439016',
                quantity: 1,
              },
            ],
          }),
        );

        expect(savedItems().map((item: any) => item.costPrice)).toEqual([
          30000, 60000,
        ]);
      });

      it('leaves the cost empty when no cost price was entered', async () => {
        await service.create(USER_ID, createDto());
        expect(savedItems()[0]).not.toHaveProperty('costPrice');
      });
    });

    it('requires a variant when the product has variants', async () => {
      variantModel.exists.mockResolvedValue({ _id: VARIANT_ID });
      await expect(service.create(USER_ID, createDto())).rejects.toThrow(
        'Vui lòng chọn phân loại',
      );
      // Không được trừ thẳng vào tồn kho tổng của sản phẩm
      expect(productModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(orderModel.create).not.toHaveBeenCalled();
    });

    it('rejects a product that is no longer on sale', async () => {
      productModel.findById.mockResolvedValue({
        name: 'P',
        basePrice: 99999,
        stock: 10,
        isActive: false,
      });
      await expect(service.create(USER_ID, createDto())).rejects.toThrow(
        BadRequestException,
      );
      expect(productModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rejects when stock was taken between check and reservation', async () => {
      productModel.findOneAndUpdate.mockResolvedValue(null);
      await expect(service.create(USER_ID, createDto())).rejects.toThrow(
        BadRequestException,
      );
      expect(orderModel.create).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    const openOrder = {
      _id: ORDER_ID,
      user: USER_ID,
      status: OrderStatus.PENDING,
      paymentStatus: PaymentStatus.UNPAID,
      items: [{ product: PRODUCT_ID, quantity: 2 }],
    };

    it('expires the pending payment and restores stock', async () => {
      orderModel.findById.mockResolvedValue(openOrder);
      orderModel.findOneAndUpdate.mockResolvedValue({
        ...openOrder,
        status: OrderStatus.CANCELLED,
      });

      await service.cancel(USER_ID, UserRole.USER, ORDER_ID);

      expect(paymentModel.updateOne).toHaveBeenCalledWith(
        {
          ...paymentOrderFilter(ORDER_ID),
          status: {
            $in: [
              PaymentTransactionStatus.PENDING,
              PaymentTransactionStatus.FAILED,
            ],
          },
        },
        { status: PaymentTransactionStatus.EXPIRED },
      );
      expect(productModel.findByIdAndUpdate).toHaveBeenCalledWith(PRODUCT_ID, {
        $inc: { stock: 2, soldCount: -2 },
      });
      expect(notificationsService.notifyOrderStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: OrderStatus.CANCELLED }),
      );
    });

    it('restores a variant order to the variant and the product total', async () => {
      const variantOrder = {
        ...openOrder,
        items: [{ product: PRODUCT_ID, variant: VARIANT_ID, quantity: 2 }],
      };
      orderModel.findById.mockResolvedValue(variantOrder);
      orderModel.findOneAndUpdate.mockResolvedValue({
        ...variantOrder,
        status: OrderStatus.CANCELLED,
      });
      variantModel.findByIdAndUpdate.mockResolvedValue({ isActive: true });

      await service.cancel(USER_ID, UserRole.USER, ORDER_ID);

      expect(variantModel.findByIdAndUpdate).toHaveBeenCalledWith(
        VARIANT_ID,
        { $inc: { stock: 2 } },
        { returnDocument: 'after' },
      );
      expect(productModel.findByIdAndUpdate).toHaveBeenCalledWith(PRODUCT_ID, {
        $inc: { stock: 2, soldCount: -2 },
      });
    });

    it('does not restore stock twice when it loses a concurrent cancel', async () => {
      orderModel.findById.mockResolvedValue(openOrder);
      orderModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.cancel(USER_ID, UserRole.USER, ORDER_ID),
      ).rejects.toThrow(BadRequestException);

      expect(productModel.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(notificationsService.notifyOrderStatus).not.toHaveBeenCalled();
    });

    it('refuses to cancel a paid order', async () => {
      orderModel.findById.mockResolvedValue({
        ...openOrder,
        paymentStatus: PaymentStatus.PAID,
      });
      await expect(
        service.cancel(USER_ID, UserRole.USER, ORDER_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update paymentStatus (COD)', () => {
    beforeEach(() => {
      orderModel.findById.mockResolvedValue({
        _id: ORDER_ID,
        user: USER_ID,
        status: OrderStatus.DELIVERED,
      });
      orderModel.findByIdAndUpdate.mockResolvedValue({ _id: ORDER_ID });
      paymentModel.findOne.mockResolvedValue({
        _id: 'payment-1',
        paymentMethod: PaymentMethod.COD,
      });
    });

    it('stores a valid transaction status when marked as paid', async () => {
      await service.update(USER_ID, UserRole.ADMIN, {
        _id: ORDER_ID,
        paymentStatus: PaymentStatus.PAID,
      });

      const [, update] = paymentModel.updateOne.mock.calls[0];
      expect(update.status).toBe(PaymentTransactionStatus.SUCCESS);
      expect(update.paidAt).toBeInstanceOf(Date);
    });

    it('resets the transaction when marked as unpaid', async () => {
      await service.update(USER_ID, UserRole.ADMIN, {
        _id: ORDER_ID,
        paymentStatus: PaymentStatus.UNPAID,
      });

      expect(paymentModel.updateOne.mock.calls[0][1]).toEqual({
        status: PaymentTransactionStatus.PENDING,
        $unset: { paidAt: 1 },
      });
    });
  });

  describe('update status notifications', () => {
    const confirmed = {
      _id: ORDER_ID,
      user: USER_ID,
      orderCode: 'ORD-1',
      status: OrderStatus.CONFIRMED,
      paymentStatus: PaymentStatus.UNPAID,
    };

    it('notifies the customer when admin moves the order forward', async () => {
      orderModel.findById.mockResolvedValue(confirmed);
      const shipping = { ...confirmed, status: OrderStatus.SHIPPING };
      orderModel.findByIdAndUpdate.mockResolvedValue(shipping);

      await service.update(USER_ID, UserRole.ADMIN, {
        _id: ORDER_ID,
        status: OrderStatus.SHIPPING,
      });

      expect(notificationsService.notifyOrderStatus).toHaveBeenCalledWith(
        shipping,
      );
      expect(notificationsService.notifyPaymentStatus).not.toHaveBeenCalled();
    });

    it('does not notify when only the note changes', async () => {
      orderModel.findById.mockResolvedValue({
        ...confirmed,
        status: OrderStatus.PENDING,
      });
      orderModel.findByIdAndUpdate.mockResolvedValue({
        ...confirmed,
        status: OrderStatus.PENDING,
      });

      await service.update(USER_ID, UserRole.ADMIN, {
        _id: ORDER_ID,
        note: 'Giao giờ hành chính',
      });

      expect(notificationsService.notifyOrderStatus).not.toHaveBeenCalled();
    });

    it('notifies when a COD order is marked as paid', async () => {
      orderModel.findById.mockResolvedValue(confirmed);
      const paid = { ...confirmed, paymentStatus: PaymentStatus.PAID };
      orderModel.findByIdAndUpdate.mockResolvedValue(paid);
      paymentModel.findOne.mockResolvedValue({
        _id: 'payment-1',
        paymentMethod: PaymentMethod.COD,
      });

      await service.update(USER_ID, UserRole.ADMIN, {
        _id: ORDER_ID,
        paymentStatus: PaymentStatus.PAID,
      });

      expect(notificationsService.notifyPaymentStatus).toHaveBeenCalledWith(
        paid,
        PaymentStatus.PAID,
      );
    });
  });
});
