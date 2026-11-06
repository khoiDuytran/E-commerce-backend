import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscountType } from '../../common/enums/discount-type.enum.js';
import { NotificationType } from '../../common/enums/notification-type.enum.js';
import { OrderStatus } from '../../common/enums/order-status.enum.js';
import { PaymentStatus } from '../../common/enums/payment-status.enum.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { NotificationsGateway, userRoom } from './notifications.gateway.js';
import { NotificationsService } from './notifications.service.js';
import {
  NOTIFICATION_TTL_SECONDS,
  NotificationSchema,
} from './schemas/notification.schema.js';

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439099';
const ADMIN_ID = '507f1f77bcf86cd7994390aa';
const ORDER_ID = '507f1f77bcf86cd799439012';
const NOTIFICATION_ID = '507f1f77bcf86cd799439013';
const PRODUCT_ID = '507f1f77bcf86cd799439014';

const order = {
  _id: ORDER_ID,
  user: USER_ID,
  orderCode: 'ORD-1',
  status: OrderStatus.SHIPPING,
  total: 150000,
};

const product = { _id: PRODUCT_ID, name: 'Áo', slug: 'ao' };

const chain = (value: unknown) => ({
  sort: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue(value),
});

// Query mock hỗ trợ .select().lean() và .select().lean().cursor()
const leanQuery = (docs: unknown[]) => {
  const query = {
    select: vi.fn(() => query),
    // await .lean() trả docs, còn .lean().cursor() trả từng doc
    lean: vi.fn(() =>
      Object.assign(Promise.resolve(docs), {
        cursor: () =>
          (async function* () {
            yield* docs;
          })(),
      }),
    ),
  };
  return query;
};

describe('NotificationsService', () => {
  let model: any;
  let userModel: any;
  let wishlistModel: any;
  let gateway: any;
  let webPush: any;
  let service: NotificationsService;

  // Các thông báo đã ghi trong lần insertMany gần nhất
  const inserted = () =>
    model.insertMany.mock.calls[model.insertMany.mock.calls.length - 1][0];

  beforeEach(() => {
    model = {
      insertMany: vi.fn().mockImplementation(async (docs: any[]) =>
        docs.map((doc) => ({
          ...doc,
          toJSON: () => ({ _id: NOTIFICATION_ID, ...doc }),
        })),
      ),
      countDocuments: vi.fn().mockResolvedValue(0),
      find: vi.fn().mockReturnValue(chain([])),
      findOneAndUpdate: vi.fn(),
      findOneAndDelete: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 2 }),
    };
    userModel = { find: vi.fn().mockReturnValue(leanQuery([])) };
    wishlistModel = { find: vi.fn().mockReturnValue(leanQuery([])) };
    gateway = {
      sendToUser: vi.fn(),
      isOnline: vi.fn().mockResolvedValue(true),
    };
    webPush = {
      enabled: true,
      sendToUsers: vi.fn().mockResolvedValue(undefined),
    };
    service = new NotificationsService(
      model,
      userModel,
      wishlistModel,
      gateway,
      webPush,
    );
  });

  describe('notifyOrderStatus', () => {
    it('stores the notification and pushes it to the order owner', async () => {
      await service.notifyOrderStatus(order);

      expect(inserted()).toEqual([
        {
          user: USER_ID,
          type: NotificationType.ORDER_STATUS,
          title: 'Cập nhật đơn hàng',
          message: 'Đơn hàng ORD-1 đang được giao đến bạn.',
          link: '/account/orders?code=ORD-1',
          data: {
            orderId: ORDER_ID,
            orderCode: 'ORD-1',
            status: OrderStatus.SHIPPING,
          },
        },
      ]);
      expect(gateway.sendToUser).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({ _id: NOTIFICATION_ID, user: USER_ID }),
      );
    });

    it('never throws so the order flow is not blocked', async () => {
      model.insertMany.mockRejectedValue(new Error('db down'));

      await expect(service.notifyOrderStatus(order)).resolves.toBeUndefined();
      expect(gateway.sendToUser).not.toHaveBeenCalled();
    });

    it('ignores a missing order', async () => {
      await service.notifyOrderStatus(null);
      expect(model.insertMany).not.toHaveBeenCalled();
    });
  });

  describe('Web Push', () => {
    it('pushes only to users who do not have the page open', async () => {
      gateway.isOnline.mockResolvedValue(false);

      await service.notifyOrderStatus(order);

      expect(webPush.sendToUsers).toHaveBeenCalledWith([USER_ID], {
        title: 'Cập nhật đơn hàng',
        body: 'Đơn hàng ORD-1 đang được giao đến bạn.',
        link: '/account/orders?code=ORD-1',
      });
    });

    it('does not push when the user is online', async () => {
      gateway.isOnline.mockResolvedValue(true);

      await service.notifyOrderStatus(order);

      expect(webPush.sendToUsers).toHaveBeenCalledWith([], expect.anything());
    });
  });

  describe('notifyPaymentStatus', () => {
    it('notifies when the order becomes paid', async () => {
      await service.notifyPaymentStatus(order, PaymentStatus.PAID);

      expect(inserted()[0]).toMatchObject({
        type: NotificationType.PAYMENT_STATUS,
        message: 'Đơn hàng ORD-1 đã được thanh toán.',
      });
    });

    it('skips statuses without a message', async () => {
      await service.notifyPaymentStatus(order, PaymentStatus.UNPAID);
      expect(model.insertMany).not.toHaveBeenCalled();
    });
  });

  describe('admin notifications', () => {
    beforeEach(() => {
      userModel.find.mockReturnValue(
        leanQuery([{ _id: ADMIN_ID }, { _id: OTHER_USER_ID }]),
      );
    });

    it('sends a new order to every active admin', async () => {
      await service.notifyAdminsNewOrder(order);

      expect(userModel.find).toHaveBeenCalledWith({
        role: UserRole.ADMIN,
        isActive: true,
        isDisabled: { $ne: true },
      });
      expect(inserted().map((doc: any) => doc.user)).toEqual([
        ADMIN_ID,
        OTHER_USER_ID,
      ]);
      expect(inserted()[0]).toMatchObject({
        type: NotificationType.NEW_ORDER,
        link: '/dashboard/orders?orderCode=ORD-1',
      });
      expect(inserted()[0].message).toContain('150.000');
    });

    it('reports low stock items', async () => {
      await service.notifyAdminsLowStock([
        { productName: 'Áo', variantName: 'M', stock: 2 },
      ]);

      expect(inserted()[0]).toMatchObject({
        type: NotificationType.LOW_STOCK,
        message: 'Áo (M): còn 2',
      });
    });

    it('skips low stock without items', async () => {
      await service.notifyAdminsLowStock([]);
      expect(userModel.find).not.toHaveBeenCalled();
    });

    it('asks admins to refund manually', async () => {
      await service.notifyAdminsManualRefund('ORD-1', 150000, 'TXN-1');

      expect(inserted()[0]).toMatchObject({
        type: NotificationType.MANUAL_REFUND_REQUIRED,
        data: { orderCode: 'ORD-1', amount: 150000, transactionNo: 'TXN-1' },
      });
    });

    it('reports refund requests', async () => {
      await service.notifyAdminsRefundRequested(order, 'Sai size');

      expect(inserted()[0]).toMatchObject({
        type: NotificationType.REFUND_REQUESTED,
        message: 'Khách gửi yêu cầu hoàn hàng cho đơn ORD-1: Sai size',
      });
    });
  });

  describe('promotions', () => {
    const coupon = {
      code: 'SALE10',
      discountType: DiscountType.PERCENT,
      discountValue: 10,
      endDate: new Date(Date.now() + 86_400_000),
      isActive: true,
    };

    it('sends a new active coupon to every active customer', async () => {
      userModel.find.mockReturnValue(
        leanQuery([{ _id: USER_ID }, { _id: OTHER_USER_ID }]),
      );

      await service.notifyNewCoupon(coupon);

      expect(userModel.find).toHaveBeenCalledWith({
        role: UserRole.USER,
        isActive: true,
        isDisabled: { $ne: true },
      });
      expect(inserted()).toHaveLength(2);
      expect(inserted()[0]).toMatchObject({
        type: NotificationType.PROMOTION,
        data: { couponCode: 'SALE10' },
      });
      expect(inserted()[0].message).toContain('giảm 10%');
    });

    it('skips inactive or expired coupons', async () => {
      await service.notifyNewCoupon({ ...coupon, isActive: false });
      await service.notifyNewCoupon({ ...coupon, endDate: new Date(0) });
      expect(userModel.find).not.toHaveBeenCalled();
    });

    it('notifies wishlist owners when a product is back in stock', async () => {
      wishlistModel.find.mockReturnValue(leanQuery([{ user: USER_ID }]));

      await service.notifyWishlistRestock(product, 'M');

      expect(wishlistModel.find).toHaveBeenCalledWith({ products: PRODUCT_ID });
      expect(inserted()[0]).toMatchObject({
        user: USER_ID,
        type: NotificationType.WISHLIST_RESTOCK,
        message: 'Áo (M) đã có hàng trở lại.',
        link: '/product/ao',
      });
    });

    it('notifies wishlist owners only when the price goes down', async () => {
      wishlistModel.find.mockReturnValue(leanQuery([{ user: USER_ID }]));

      await service.notifyWishlistPriceDrop(product, 200000, 250000);
      expect(model.insertMany).not.toHaveBeenCalled();

      await service.notifyWishlistPriceDrop(product, 200000, 150000);
      expect(inserted()[0]).toMatchObject({
        type: NotificationType.WISHLIST_PRICE_DROP,
        data: { oldPrice: 200000, newPrice: 150000 },
      });
    });
  });

  describe('findAll', () => {
    it('always scopes the list to the current user', async () => {
      await service.findAll(USER_ID, `user=${OTHER_USER_ID}` as any, 1, 10);

      expect(model.countDocuments).toHaveBeenCalledWith({ user: USER_ID });
      expect(model.find).toHaveBeenCalledWith({ user: USER_ID });
    });

    it('returns pagination meta and the unread count', async () => {
      model.countDocuments.mockResolvedValueOnce(15).mockResolvedValueOnce(4);

      const result = await service.findAll(USER_ID, '' as any, 2, 10);

      expect(result.meta).toEqual({
        current: 2,
        pageSize: 10,
        pages: 2,
        total: 15,
      });
      expect(result.unreadCount).toBe(4);
    });
  });

  describe('markRead / remove', () => {
    it('only updates a notification owned by the user', async () => {
      model.findOneAndUpdate.mockResolvedValue({ _id: NOTIFICATION_ID });

      await service.markRead(USER_ID, NOTIFICATION_ID);

      expect(model.findOneAndUpdate.mock.calls[0][0]).toEqual({
        _id: NOTIFICATION_ID,
        user: USER_ID,
      });
    });

    it('returns 404 for a notification of another user', async () => {
      model.findOneAndUpdate.mockResolvedValue(null);
      await expect(service.markRead(USER_ID, NOTIFICATION_ID)).rejects.toThrow(
        NotFoundException,
      );

      model.findOneAndDelete.mockResolvedValue(null);
      await expect(service.remove(USER_ID, NOTIFICATION_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects a malformed id', async () => {
      await expect(service.markRead(USER_ID, 'abc')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('marks all unread notifications of the user as read', async () => {
      const result = await service.markAllRead(USER_ID);

      expect(model.updateMany.mock.calls[0][0]).toEqual({
        user: USER_ID,
        isRead: false,
      });
      expect(result.modifiedCount).toBe(2);
    });
  });

  it('expires notifications after 90 days', () => {
    const ttl = NotificationSchema.indexes().find(
      ([fields, options]) =>
        fields.createdAt === 1 && options?.expireAfterSeconds,
    );
    expect(ttl?.[1]?.expireAfterSeconds).toBe(NOTIFICATION_TTL_SECONDS);
    expect(NOTIFICATION_TTL_SECONDS).toBe(90 * 24 * 60 * 60);
  });
});

describe('NotificationsGateway', () => {
  const SECRET = 'test-secret';
  const jwtService = new JwtService({ secret: SECRET });
  const configService = { getOrThrow: () => SECRET } as any;
  let gateway: NotificationsGateway;

  const makeClient = (auth: Record<string, unknown> = {}, headers = {}) => ({
    id: 'socket-1',
    handshake: { auth, headers },
    join: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    once: vi.fn(),
  });

  const accessToken = (expiresIn = 3600) =>
    jwtService.sign({ sub: USER_ID }, { expiresIn });

  beforeEach(() => {
    gateway = new NotificationsGateway(jwtService, configService);
  });

  it('joins the user room with a valid access token', async () => {
    const client = makeClient({ token: accessToken() });

    await gateway.handleConnection(client as any);

    expect(client.join).toHaveBeenCalledWith(userRoom(USER_ID));
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('accepts a Bearer authorization header', async () => {
    const client = makeClient({}, { authorization: `Bearer ${accessToken()}` });

    await gateway.handleConnection(client as any);

    expect(client.join).toHaveBeenCalledWith(userRoom(USER_ID));
  });

  it('accepts a socket ticket', async () => {
    const { ticket } = gateway.createTicket(USER_ID, accessToken());
    const client = makeClient({ token: ticket });

    await gateway.handleConnection(client as any);

    expect(client.join).toHaveBeenCalledWith(userRoom(USER_ID));
  });

  it('signs tickets with a different secret than access tokens', async () => {
    const { ticket } = gateway.createTicket(USER_ID, accessToken());
    // JwtStrategy của REST API dùng JWT_SECRET: vé socket không được qua
    await expect(jwtService.verifyAsync(ticket)).rejects.toThrow();
  });

  it('disconnects a client without a token', async () => {
    const client = makeClient();

    await gateway.handleConnection(client as any);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects a client with an invalid token', async () => {
    const client = makeClient({ token: 'abc.def.ghi' });

    await gateway.handleConnection(client as any);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects when the session behind a ticket expires', async () => {
    vi.useFakeTimers();
    try {
      const { ticket } = gateway.createTicket(USER_ID, accessToken(120));
      const client = makeClient({ token: ticket });

      await gateway.handleConnection(client as any);
      // Vé hết hạn sau 60 giây nhưng socket đã mở vẫn sống theo phiên đăng nhập
      vi.advanceTimersByTime(90_000);
      expect(client.disconnect).not.toHaveBeenCalled();

      vi.advanceTimersByTime(31_000);
      expect(client.disconnect).toHaveBeenCalledWith(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
