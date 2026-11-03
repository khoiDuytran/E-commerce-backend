import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import aqp from 'api-query-params';
import { Model, Types } from 'mongoose';
import { DiscountType } from '../../common/enums/discount-type.enum.js';
import { NotificationType } from '../../common/enums/notification-type.enum.js';
import { OrderStatus } from '../../common/enums/order-status.enum.js';
import { PaymentStatus } from '../../common/enums/payment-status.enum.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import {
  MAX_PAGE_SIZE,
  stripUnsafeOperators,
  validateObjectIdHelper,
} from '../../helpers/utils.js';
import { User, UserDocument } from '../users/schemas/user.schema.js';
import {
  Wishlist,
  WishlistDocument,
} from '../wishlist/schemas/wishlist.schema.js';
import { NotificationsGateway } from './notifications.gateway.js';
import {
  Notification,
  NotificationDocument,
} from './schemas/notification.schema.js';
import { WebPushService } from './web-push.service.js';

// Ngưỡng tồn kho thấp, cùng ngưỡng với dashboard
export const LOW_STOCK_THRESHOLD = 5;

// Số thông báo ghi vào database mỗi lần khi gửi cho nhiều user
const BATCH_SIZE = 500;

const ORDER_STATUS_MESSAGES: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'Đơn hàng {code} đã được đặt và đang chờ xác nhận.',
  [OrderStatus.CONFIRMED]: 'Đơn hàng {code} đã được xác nhận.',
  [OrderStatus.SHIPPING]: 'Đơn hàng {code} đang được giao đến bạn.',
  [OrderStatus.DELIVERED]: 'Đơn hàng {code} đã giao thành công.',
  [OrderStatus.CANCELLED]: 'Đơn hàng {code} đã bị huỷ.',
  [OrderStatus.RETURN_REQUESTED]:
    'Yêu cầu hoàn hàng cho đơn {code} đã được gửi.',
  [OrderStatus.RETURN_APPROVED]:
    'Yêu cầu hoàn hàng cho đơn {code} đã được chấp nhận.',
  [OrderStatus.RETURN_RECEIVED]: 'Cửa hàng đã nhận lại hàng của đơn {code}.',
  [OrderStatus.REFUNDED]: 'Đơn hàng {code} đã được hoàn tiền.',
  [OrderStatus.RETURN_REJECTED]:
    'Yêu cầu hoàn hàng cho đơn {code} đã bị từ chối.',
};

const PAYMENT_STATUS_MESSAGES: Partial<Record<PaymentStatus, string>> = {
  [PaymentStatus.PAID]: 'Đơn hàng {code} đã được thanh toán.',
};

export const formatVnd = (value: number) =>
  `${new Intl.NumberFormat('vi-VN').format(value)}đ`;

const customerOrderLink = (orderCode: string) =>
  `/account/orders?code=${encodeURIComponent(orderCode)}`;
const adminOrderLink = (orderCode: string) =>
  `/dashboard/orders?orderCode=${encodeURIComponent(orderCode)}`;

type Id = Types.ObjectId | string;

/** Thông tin tối thiểu của đơn hàng để tạo thông báo */
export interface OrderNotificationInput {
  _id: Id;
  user: Id;
  orderCode: string;
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  total?: number;
}

export interface ProductNotificationInput {
  _id: Id;
  name: string;
  slug: string;
}

export interface LowStockItem {
  productName: string;
  variantName?: string;
  stock: number;
}

export interface CouponNotificationInput {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  endDate: Date;
  isActive: boolean;
}

interface NotificationContent {
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Wishlist.name)
    private readonly wishlistModel: Model<WishlistDocument>,
    private readonly gateway: NotificationsGateway,
    private readonly webPushService: WebPushService,
  ) {}

  // ================= Cho khách =================
  // Các hàm notify* không throw để không chặn luồng nghiệp vụ gọi chúng.

  async notifyOrderStatus(order: OrderNotificationInput | null | undefined) {
    if (!order) return;
    await this.deliver([order.user], {
      type: NotificationType.ORDER_STATUS,
      title: 'Cập nhật đơn hàng',
      message: ORDER_STATUS_MESSAGES[order.status]?.replace(
        '{code}',
        order.orderCode,
      ),
      link: customerOrderLink(order.orderCode),
      data: this.orderData(order, { status: order.status }),
    });
  }

  async notifyPaymentStatus(
    order: OrderNotificationInput | null | undefined,
    paymentStatus: PaymentStatus,
  ) {
    const template = PAYMENT_STATUS_MESSAGES[paymentStatus];
    if (!order || !template) return;
    await this.deliver([order.user], {
      type: NotificationType.PAYMENT_STATUS,
      title: 'Cập nhật thanh toán',
      message: template.replace('{code}', order.orderCode),
      link: customerOrderLink(order.orderCode),
      data: this.orderData(order, { paymentStatus }),
    });
  }

  /** Coupon mới đang hiệu lực: báo cho mọi khách hàng */
  async notifyNewCoupon(coupon: CouponNotificationInput) {
    if (!coupon.isActive || new Date(coupon.endDate) <= new Date()) return;
    const discount =
      coupon.discountType === DiscountType.PERCENT
        ? `${coupon.discountValue}%`
        : formatVnd(coupon.discountValue);
    const until = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(new Date(coupon.endDate));
    try {
      const customers = this.userModel
        .find({ role: UserRole.USER, isActive: true })
        .select('_id')
        .lean()
        .cursor();
      let batch: Id[] = [];
      for await (const customer of customers) {
        batch.push(customer._id);
        if (batch.length >= BATCH_SIZE) {
          await this.deliverCoupon(batch, coupon.code, discount, until);
          batch = [];
        }
      }
      await this.deliverCoupon(batch, coupon.code, discount, until);
    } catch (error) {
      this.logError(`Không gửi được thông báo coupon ${coupon.code}`, error);
    }
  }

  async notifyWishlistRestock(
    product: ProductNotificationInput,
    variantName?: string,
  ) {
    const name = variantName
      ? `${product.name} (${variantName})`
      : product.name;
    await this.deliverToWishlist(product, {
      type: NotificationType.WISHLIST_RESTOCK,
      title: 'Sản phẩm yêu thích đã có hàng',
      message: `${name} đã có hàng trở lại.`,
    });
  }

  async notifyWishlistPriceDrop(
    product: ProductNotificationInput,
    oldPrice: number,
    newPrice: number,
    variantName?: string,
  ) {
    if (!(newPrice < oldPrice)) return;
    const name = variantName
      ? `${product.name} (${variantName})`
      : product.name;
    await this.deliverToWishlist(product, {
      type: NotificationType.WISHLIST_PRICE_DROP,
      title: 'Sản phẩm yêu thích giảm giá',
      message: `${name} giảm từ ${formatVnd(oldPrice)} còn ${formatVnd(newPrice)}.`,
      data: { oldPrice, newPrice },
    });
  }

  // ================= Cho admin =================

  async notifyAdminsNewOrder(order: OrderNotificationInput) {
    const total =
      order.total !== undefined ? `, tổng ${formatVnd(order.total)}` : '';
    await this.deliverToAdmins({
      type: NotificationType.NEW_ORDER,
      title: 'Đơn hàng mới',
      message: `Có đơn hàng mới ${order.orderCode}${total}.`,
      link: adminOrderLink(order.orderCode),
      data: this.orderData(order),
    });
  }

  async notifyAdminsRefundRequested(
    order: OrderNotificationInput,
    reason?: string,
  ) {
    await this.deliverToAdmins({
      type: NotificationType.REFUND_REQUESTED,
      title: 'Yêu cầu hoàn hàng',
      message: `Khách gửi yêu cầu hoàn hàng cho đơn ${order.orderCode}${reason ? `: ${reason}` : '.'}`,
      link: adminOrderLink(order.orderCode),
      data: this.orderData(order),
    });
  }

  async notifyAdminsLowStock(items: LowStockItem[]) {
    if (items.length === 0) return;
    const names = items.map((item) =>
      item.variantName
        ? `${item.productName} (${item.variantName}): còn ${item.stock}`
        : `${item.productName}: còn ${item.stock}`,
    );
    await this.deliverToAdmins({
      type: NotificationType.LOW_STOCK,
      title: 'Sắp hết hàng',
      message: names.join('; '),
      link:
        items.length === 1
          ? `/dashboard/products?name=${encodeURIComponent(items[0].productName)}`
          : '/dashboard/products',
      data: { items },
    });
  }

  /** Tiền VNPay về sau khi đơn đã đóng: admin phải hoàn tiền thủ công */
  async notifyAdminsManualRefund(
    orderCode: string,
    amount: number,
    transactionNo?: string,
  ) {
    await this.deliverToAdmins({
      type: NotificationType.MANUAL_REFUND_REQUIRED,
      title: 'Cần hoàn tiền thủ công',
      message: `Đơn ${orderCode} đã đóng nhưng nhận được ${formatVnd(amount)} qua VNPay. Cần hoàn tiền thủ công.`,
      link: adminOrderLink(orderCode),
      data: { orderCode, amount, transactionNo },
    });
  }

  // ================= API cho user =================

  async findAll(
    userId: string,
    query: string,
    current: number,
    pageSize: number,
  ) {
    const { filter } = aqp(query);
    stripUnsafeOperators(filter);
    delete filter.current;
    delete filter.pageSize;
    // Gán sau khi parse để user không đọc được thông báo của người khác
    filter.user = userId;

    if (!current || current < 1) current = 1;
    pageSize =
      !pageSize || pageSize < 1 ? 10 : Math.min(pageSize, MAX_PAGE_SIZE);

    const [totalItems, unreadCount] = await Promise.all([
      this.notificationModel.countDocuments(filter),
      this.notificationModel.countDocuments({ user: userId, isRead: false }),
    ]);
    const results = await this.notificationModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((current - 1) * pageSize)
      .limit(pageSize);

    return {
      meta: {
        current,
        pageSize,
        pages: Math.ceil(totalItems / pageSize),
        total: totalItems,
      },
      unreadCount,
      results,
    };
  }

  async countUnread(userId: string) {
    const unreadCount = await this.notificationModel.countDocuments({
      user: userId,
      isRead: false,
    });
    return { unreadCount };
  }

  async markRead(userId: string, id: string) {
    validateObjectIdHelper(id);
    const notification = await this.notificationModel.findOneAndUpdate(
      { _id: id, user: userId },
      { isRead: true, readAt: new Date() },
      { returnDocument: 'after', runValidators: true },
    );
    if (!notification) throw new NotFoundException('Không tìm thấy thông báo');
    return notification;
  }

  async markAllRead(userId: string) {
    const result = await this.notificationModel.updateMany(
      { user: userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
    return {
      message: 'Đã đánh dấu tất cả thông báo là đã đọc',
      modifiedCount: result.modifiedCount,
    };
  }

  async remove(userId: string, id: string) {
    validateObjectIdHelper(id);
    const deleted = await this.notificationModel.findOneAndDelete({
      _id: id,
      user: userId,
    });
    if (!deleted) throw new NotFoundException('Không tìm thấy thông báo');
    return { message: 'Xoá thông báo thành công' };
  }

  // ================= Nội bộ =================

  private orderData(
    order: OrderNotificationInput,
    extra: Record<string, unknown> = {},
  ) {
    return { orderId: String(order._id), orderCode: order.orderCode, ...extra };
  }

  private async deliverToAdmins(content: NotificationContent) {
    try {
      const admins = await this.userModel
        .find({ role: UserRole.ADMIN, isActive: true })
        .select('_id')
        .lean();
      await this.deliver(
        admins.map((admin) => admin._id),
        content,
      );
    } catch (error) {
      this.logError(
        `Không gửi được thông báo ${content.type} cho admin`,
        error,
      );
    }
  }

  private async deliverToWishlist(
    product: ProductNotificationInput,
    content: Omit<NotificationContent, 'link'>,
  ) {
    try {
      const wishlists = await this.wishlistModel
        .find({ products: product._id })
        .select('user')
        .lean();
      await this.deliver(
        wishlists.map((wishlist) => wishlist.user),
        {
          ...content,
          link: `/product/${encodeURIComponent(product.slug)}`,
          data: {
            productId: String(product._id),
            productSlug: product.slug,
            ...content.data,
          },
        },
      );
    } catch (error) {
      this.logError(`Không gửi được thông báo ${content.type}`, error);
    }
  }

  private deliverCoupon(
    userIds: Id[],
    code: string,
    discount: string,
    until: string,
  ) {
    return this.deliver(userIds, {
      type: NotificationType.PROMOTION,
      title: 'Mã giảm giá mới',
      message: `Nhập mã ${code} để được giảm ${discount}, áp dụng đến ${until}.`,
      link: '/shop',
      data: { couponCode: code },
    });
  }

  /**
   * Lưu thông báo, đẩy realtime qua socket, và gửi Web Push cho user không mở trang.
   * Không throw để không chặn luồng nghiệp vụ.
   */
  private async deliver(userIds: Id[], content: NotificationContent) {
    if (!content.message || userIds.length === 0) return;
    const recipients = [...new Set(userIds.map(String))];
    try {
      const docs = await this.notificationModel.insertMany(
        recipients.map((user) => ({
          user,
          type: content.type,
          title: content.title,
          message: content.message,
          link: content.link,
          data: content.data ?? {},
        })),
      );
      const offline: string[] = [];
      for (const doc of docs) {
        const userId = String(doc.user);
        this.gateway.sendToUser(userId, doc.toJSON());
        if (
          this.webPushService.enabled &&
          !(await this.gateway.isOnline(userId))
        ) {
          offline.push(userId);
        }
      }
      // Không chờ dịch vụ push của trình duyệt để request nghiệp vụ trả về nhanh;
      // sendToUsers tự bắt lỗi
      void this.webPushService.sendToUsers(offline, {
        title: content.title,
        body: content.message,
        link: content.link,
      });
    } catch (error) {
      this.logError(
        `Không gửi được thông báo ${content.type} cho ${recipients.length} user`,
        error,
      );
    }
  }

  private logError(message: string, error: unknown) {
    this.logger.error(
      message,
      error instanceof Error ? error.stack : String(error),
    );
  }
}
