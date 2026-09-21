import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { InjectModel } from '@nestjs/mongoose';
import aqp from 'api-query-params';
import { Model } from 'mongoose';
import { DiscountType } from '../../common/enums/discount-type.enum.js';
import { OrderStatus } from '../../common/enums/order-status.enum.js';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';
import { PaymentStatus } from '../../common/enums/payment-status.enum.js';
import { validateObjectIdHelper } from '../../helpers/utils.js';
import { AddressesService } from '../addresses/addresses.service.js';
import { Coupon, CouponDocument } from '../coupons/schemas/coupon.schema.js';
import {
  Payment,
  PaymentDocument,
} from '../payments/schemas/payment.schema.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import {
  Product,
  ProductDocument,
} from '../products/schemas/product.schema.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { UpdateOrderDto } from './dto/update-order.dto.js';
import { Order, OrderDocument } from './schemas/order.schema.js';
import { PaymentsService } from '../payments/payments.service.js';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

// Chỉ cho phép chuyển trạng thái theo chiều tiến.
// Huỷ đơn đi qua cancel(), hoàn tiền đi qua refund service.
const ORDER_STATUS_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED],
  [OrderStatus.CONFIRMED]: [OrderStatus.SHIPPING],
  [OrderStatus.SHIPPING]: [OrderStatus.DELIVERED],
};

// Đơn ở các trạng thái này không được cập nhật nữa
const CLOSED_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
];

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Coupon.name)
    private readonly couponModel: Model<CouponDocument>,
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    private readonly addressesService: AddressesService,
    private readonly paymentsService: PaymentsService,
  ) {}

  private assertAdmin(userRole: UserRole) {
    if (userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    }
  }

  /**
   * Admin truy cập được mọi đơn; user thường chỉ truy cập được đơn của mình.
   */
  private async findAccessibleOrThrow(
    _id: string,
    userId: string,
    userRole: UserRole,
  ): Promise<OrderDocument> {
    validateObjectIdHelper(_id);

    const order = await this.orderModel.findById(_id);
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    if (userRole !== UserRole.ADMIN && order.user.toString() !== userId) {
      throw new ForbiddenException('Bạn không có quyền truy cập đơn hàng này');
    }

    return order;
  }

  /**
   * Hoàn kho + hoàn lượt dùng coupon. Không throw để không che lỗi gốc
   * của caller; lỗi hoàn tác chỉ được log lại để xử lý thủ công.
   */
  private async restoreStockAndCoupon(
    stockChanges: Array<{ productId: string; quantity: number }>,
    couponId?: string,
  ) {
    for (const { productId, quantity } of stockChanges) {
      try {
        await this.productModel.findByIdAndUpdate(productId, {
          $inc: { stock: quantity, soldCount: -quantity },
        });
      } catch (error) {
        this.logger.error(
          `Không hoàn được kho cho sản phẩm ${productId} (+${quantity})`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    if (couponId) {
      try {
        await this.couponModel.findByIdAndUpdate(couponId, {
          $inc: { usedCount: -1 },
        });
      } catch (error) {
        this.logger.error(
          `Không hoàn được lượt dùng coupon ${couponId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  private async paginate(
    baseFilter: Record<string, unknown>,
    query: Record<string, any>,
    current: number,
    pageSize: number,
  ) {
    const { filter, sort } = aqp(query);
    delete filter.current;
    delete filter.pageSize;

    // Gán SAU khi parse query để client không ghi đè được filter bắt buộc
    Object.assign(filter, baseFilter);

    const page = Number.isInteger(current) && current > 0 ? current : 1;
    const size =
      Number.isInteger(pageSize) && pageSize > 0
        ? Math.min(pageSize, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;

    // Sort mặc định để phân trang ổn định
    const sortOption =
      sort && Object.keys(sort).length > 0 ? sort : { createdAt: -1 };

    const [totalItems, results] = await Promise.all([
      this.orderModel.countDocuments(filter),
      this.orderModel
        .find(filter)
        .sort(sortOption as any)
        .skip((page - 1) * size)
        .limit(size),
    ]);

    return {
      meta: {
        current: page,
        pageSize: size,
        pages: Math.ceil(totalItems / size),
        total: totalItems,
      },
      results,
    };
  }

  async create(userId: string, createOrderDto: CreateOrderDto) {
    const { items, addressId, shippingAddress, coupon, note, paymentMethod } =
      createOrderDto;

    validateObjectIdHelper(userId);

    if (!items || items.length === 0) {
      throw new BadRequestException('items không được rỗng');
    }

    if (addressId && shippingAddress) {
      throw new BadRequestException(
        'Chỉ được chọn 1 trong 2: addressId hoặc shippingAddress',
      );
    }

    if (!addressId && !shippingAddress) {
      throw new BadRequestException(
        'Phải cung cấp addressId hoặc shippingAddress',
      );
    }

    let snapshotShippingAddress: {
      fullName: string;
      phone: string;
      province: string;
      district: string;
      ward: string;
      detail: string;
    };

    if (addressId) {
      const address = await this.addressesService.findOne(addressId, userId);
      snapshotShippingAddress = {
        fullName: address.fullName,
        phone: address.phone,
        province: address.province,
        district: address.district,
        ward: address.ward,
        detail: address.detail,
      };
    } else {
      if (!shippingAddress) {
        throw new BadRequestException(
          'Phải cung cấp addressId hoặc shippingAddress',
        );
      }

      snapshotShippingAddress = {
        fullName: shippingAddress.fullName,
        phone: shippingAddress.phone,
        province: shippingAddress.province,
        district: shippingAddress.district,
        ward: shippingAddress.ward,
        detail: shippingAddress.detail,
      };
    }

    const itemSnapshots: Array<{
      product: string;
      productName: string;
      image: string;
      price: number;
      quantity: number;
    }> = [];
    const stockChecks = new Map<string, number>();

    let subtotal = 0;

    for (const item of items) {
      validateObjectIdHelper(item.product);
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new BadRequestException(
          'quantity của từng item phải là số nguyên lớn hơn 0',
        );
      }

      const product = await this.productModel.findById(item.product);
      if (!product) {
        throw new NotFoundException(`Không tìm thấy sản phẩm ${item.product}`);
      }

      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Sản phẩm ${product.name} không đủ tồn kho. Còn ${product.stock}, cần ${item.quantity}`,
        );
      }

      const productId = item.product.toString();
      stockChecks.set(
        productId,
        (stockChecks.get(productId) ?? 0) + item.quantity,
      );

      const itemPrice = product.basePrice;
      subtotal += itemPrice * item.quantity;

      itemSnapshots.push({
        product: productId,
        productName: product.name,
        image: product.images?.[0] ?? '',
        price: itemPrice,
        quantity: item.quantity,
      });
    }

    let discount = 0;
    // TODO: tính shippingFee dựa trên snapshotShippingAddress/tổng khối lượng đơn — hiện đang hardcode 0
    const shippingFee = 0;

    if (coupon) {
      validateObjectIdHelper(coupon);

      const currentTime = new Date();
      const couponDoc = await this.couponModel.findOne({
        _id: coupon,
        isActive: true,
        startDate: { $lte: currentTime },
        endDate: { $gte: currentTime },
        $expr: { $lt: ['$usedCount', '$usageLimit'] },
      });

      if (!couponDoc) {
        throw new BadRequestException(
          'Mã giảm giá không hợp lệ hoặc đã hết lượt sử dụng',
        );
      }

      if (couponDoc.minOrderValue && subtotal < couponDoc.minOrderValue) {
        throw new BadRequestException(
          `Đơn hàng tối thiểu phải từ ${couponDoc.minOrderValue} để áp dụng mã này`,
        );
      }

      if (couponDoc.discountType === DiscountType.PERCENT) {
        discount = Math.min(
          subtotal * (couponDoc.discountValue / 100),
          couponDoc.maxDiscount ?? subtotal,
        );
      } else {
        discount = Math.min(
          couponDoc.discountValue,
          couponDoc.maxDiscount ?? couponDoc.discountValue,
        );
      }
    }

    const total = Math.max(subtotal - discount + shippingFee, 0);

    // Track lại những gì đã ghi thành công, để revert nếu bước sau fail
    const appliedStockChanges: Array<{ productId: string; quantity: number }> =
      [];
    let couponApplied = false;
    let createdOrderId: string | undefined;

    try {
      const orderCode = `ORD-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;

      for (const [productId, quantity] of stockChecks.entries()) {
        const updatedProduct = await this.productModel.findOneAndUpdate(
          { _id: productId, stock: { $gte: quantity } },
          { $inc: { stock: -quantity, soldCount: quantity } },
          { returnDocument: 'after' },
        );

        if (!updatedProduct) {
          throw new BadRequestException(
            'Có sản phẩm không còn đủ hàng để đặt đơn',
          );
        }
        appliedStockChanges.push({ productId, quantity });
      }

      if (coupon) {
        const currentTime = new Date();
        const updatedCoupon = await this.couponModel.findOneAndUpdate(
          {
            _id: coupon,
            isActive: true,
            startDate: { $lte: currentTime },
            endDate: { $gte: currentTime },
            $expr: { $lt: ['$usedCount', '$usageLimit'] },
          },
          { $inc: { usedCount: 1 } },
          { returnDocument: 'after' },
        );

        if (!updatedCoupon) {
          throw new BadRequestException('Mã giảm giá đã hết lượt sử dụng');
        }
        couponApplied = true;
      }

      const order = await this.orderModel.create({
        orderCode,
        user: userId,
        items: itemSnapshots,
        shippingAddress: snapshotShippingAddress,
        coupon: coupon ?? undefined,
        subtotal,
        discount,
        shippingFee,
        total,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.UNPAID,
        note,
      });
      createdOrderId = order._id.toString();

      const payment = await this.paymentsService.createForOrder(
        userId,
        createdOrderId,
        order.orderCode,
        order.total,
        paymentMethod,
      );

      return { message: 'Tạo đơn hàng thành công', order, payment };
    } catch (err) {
      // Compensation: hoàn lại những gì đã ghi thành công trước khi lỗi xảy ra.
      // Xoá order trước để không để lại đơn "mồ côi" không có payment.
      if (createdOrderId) {
        try {
          await this.orderModel.findByIdAndDelete(createdOrderId);
        } catch (error) {
          this.logger.error(
            `Không xoá được đơn mồ côi ${createdOrderId}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
      await this.restoreStockAndCoupon(
        appliedStockChanges,
        couponApplied ? coupon : undefined,
      );
      throw err;
    }
  }

  /** Đơn hàng của chính user đang đăng nhập */
  async findAll(
    userId: string,
    query: Record<string, any>,
    current: number,
    pageSize: number,
  ) {
    return this.paginate({ user: userId }, query, current, pageSize);
  }

  /** Toàn bộ đơn hàng — chỉ admin */
  async findAllForAdmin(
    userRole: UserRole,
    query: Record<string, any>,
    current: number,
    pageSize: number,
  ) {
    this.assertAdmin(userRole);
    return this.paginate({}, query, current, pageSize);
  }

  async findOne(userId: string, userRole: UserRole, _id: string) {
    return this.findAccessibleOrThrow(_id, userId, userRole);
  }

  async findByOrderCode(userId: string, userRole: UserRole, orderCode: string) {
    const normalizedOrderCode = orderCode?.trim();
    if (!normalizedOrderCode) {
      throw new BadRequestException('orderCode không được để trống');
    }

    const filter =
      userRole === UserRole.ADMIN
        ? { orderCode: normalizedOrderCode }
        : { orderCode: normalizedOrderCode, user: userId };

    const order = await this.orderModel.findOne(filter);
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    return order;
  }

  async update(
    userId: string,
    userRole: UserRole,
    updateOrderDto: UpdateOrderDto,
  ) {
    const { _id, ...updateData } = updateOrderDto;
    const isAdmin = userRole === UserRole.ADMIN;

    const order = await this.findAccessibleOrThrow(_id, userId, userRole);

    if (
      updateData.status === OrderStatus.REFUNDED ||
      updateData.paymentStatus === PaymentStatus.REFUNDED
    ) {
      throw new BadRequestException(
        'Trạng thái hoàn tiền phải được xử lý qua refund service',
      );
    }

    if (updateData.status === OrderStatus.CANCELLED) {
      throw new BadRequestException(
        'Huỷ đơn hàng phải thực hiện qua route huỷ đơn (PATCH /orders/cancel/:id)',
      );
    }

    if (CLOSED_ORDER_STATUSES.includes(order.status)) {
      throw new BadRequestException('Đơn hàng đã kết thúc, không thể cập nhật');
    }

    if (!isAdmin) {
      if (updateData.status || updateData.paymentStatus) {
        throw new ForbiddenException(
          'Bạn không có quyền cập nhật trạng thái đơn hàng',
        );
      }

      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException(
          'Chỉ có thể cập nhật địa chỉ giao hàng hoặc ghi chú khi đơn hàng đang chờ xử lý',
        );
      }
    }

    if (updateData.status !== undefined && updateData.status !== order.status) {
      const allowed = ORDER_STATUS_TRANSITIONS[order.status] ?? [];
      if (!allowed.includes(updateData.status)) {
        throw new BadRequestException(
          `Không thể chuyển trạng thái đơn hàng từ ${order.status} sang ${updateData.status}`,
        );
      }
    }

    let payment: PaymentDocument | null = null;
    if (updateData.paymentStatus !== undefined) {
      payment = await this.paymentModel.findOne({ orderId: order._id });
      if (!payment) {
        throw new NotFoundException('Không tìm thấy payment của đơn hàng');
      }

      if (payment.paymentMethod !== PaymentMethod.COD) {
        throw new BadRequestException(
          'Chỉ được cập nhật paymentStatus thủ công cho đơn hàng COD',
        );
      }
    }

    // Whitelist field cho cả user lẫn admin
    const allowedUpdateData: Record<string, unknown> = {};
    if (updateData.shippingAddress) {
      allowedUpdateData.shippingAddress = updateData.shippingAddress;
    }
    if (updateData.note !== undefined) {
      allowedUpdateData.note = updateData.note;
    }
    if (isAdmin) {
      if (updateData.status !== undefined) {
        allowedUpdateData.status = updateData.status;
      }
      if (updateData.paymentStatus !== undefined) {
        allowedUpdateData.paymentStatus = updateData.paymentStatus;
      }
    }

    if (Object.keys(allowedUpdateData).length === 0) {
      throw new BadRequestException('Không có thông tin hợp lệ để cập nhật');
    }

    const updated = await this.orderModel.findByIdAndUpdate(
      _id,
      allowedUpdateData,
      { returnDocument: 'after', runValidators: true },
    );

    if (!updated) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    // Đồng bộ trạng thái sang Payment để 2 collection không bị lệch nhau
    if (payment && updateData.paymentStatus !== undefined) {
      await this.paymentModel.updateOne(
        { _id: payment._id },
        { status: updateData.paymentStatus },
      );
    }

    return { message: 'Cập nhật đơn hàng thành công', order: updated };
  }

  /**
   * Huỷ đơn: hoàn kho + hoàn lượt dùng coupon.
   * - User: chỉ huỷ được đơn PENDING của mình.
   * - Admin: huỷ được đơn PENDING hoặc CONFIRMED.
   * - Đơn đã thanh toán phải đi qua refund service.
   */
  async cancel(userId: string, userRole: UserRole, _id: string) {
    const order = await this.findAccessibleOrThrow(_id, userId, userRole);

    if (order.paymentStatus !== PaymentStatus.UNPAID) {
      throw new BadRequestException(
        'Đơn hàng đã thanh toán, vui lòng xử lý qua refund service',
      );
    }

    const cancellableStatuses =
      userRole === UserRole.ADMIN
        ? [OrderStatus.PENDING, OrderStatus.CONFIRMED]
        : [OrderStatus.PENDING];

    if (!cancellableStatuses.includes(order.status)) {
      throw new BadRequestException(
        'Đơn hàng ở trạng thái hiện tại không thể huỷ',
      );
    }

    // Chuyển trạng thái nguyên tử: 2 request huỷ cùng lúc thì chỉ 1 request
    // thắng, tránh hoàn kho 2 lần.
    const cancelled = await this.orderModel.findOneAndUpdate(
      {
        _id,
        status: { $in: cancellableStatuses },
        paymentStatus: PaymentStatus.UNPAID,
      },
      { status: OrderStatus.CANCELLED },
      { returnDocument: 'after' },
    );

    if (!cancelled) {
      throw new BadRequestException(
        'Đơn hàng vừa được cập nhật, không thể huỷ. Vui lòng tải lại',
      );
    }

    await this.restoreStockAndCoupon(
      cancelled.items.map((item) => ({
        productId: item.product.toString(),
        quantity: item.quantity,
      })),
      cancelled.coupon?.toString(),
    );

    return { message: 'Huỷ đơn hàng thành công', order: cancelled };
  }

  /** Xoá cứng — chỉ admin, và chỉ với đơn đã huỷ (dọn dữ liệu) */
  async remove(userRole: UserRole, _id: string) {
    this.assertAdmin(userRole);
    validateObjectIdHelper(_id);

    const order = await this.orderModel.findById(_id);
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    if (order.status !== OrderStatus.CANCELLED) {
      throw new BadRequestException('Chỉ được xoá đơn hàng đã huỷ');
    }

    await this.paymentModel.deleteMany({ orderId: order._id });
    await this.orderModel.findByIdAndDelete(_id);

    return { message: 'Xoá đơn hàng thành công' };
  }
}
