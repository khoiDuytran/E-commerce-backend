import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { InjectModel } from '@nestjs/mongoose';
import aqp from 'api-query-params';
import mongoose, { Model } from 'mongoose';
import { DiscountType } from '../../common/enums/discount-type.enum.js';
import { OrderStatus } from '../../common/enums/order-status.enum.js';
import { PaymentStatus } from '../../common/enums/payment-status.enum.js';
import { validateObjectIdHelper } from '../../helpers/utils.js';
import { AddressesService } from '../addresses/addresses.service.js';
import { Coupon, CouponDocument } from '../coupons/schemas/coupon.schema.js';
import {
  Product,
  ProductDocument,
} from '../products/schemas/product.schema.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { UpdateOrderDto } from './dto/update-order.dto.js';
import { Order, OrderDocument } from './schemas/order.schema.js';
import { PaymentsService } from '../payments/payments.service.js';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Coupon.name)
    private readonly couponModel: Model<CouponDocument>,
    private readonly addressesService: AddressesService,
    private readonly paymentsService: PaymentsService,
  ) {}

  private async findOwnedOrThrow(
    _id: string,
    userId: string,
  ): Promise<OrderDocument> {
    validateObjectIdHelper(_id);

    const order = await this.orderModel.findById(_id);
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    if (order.user.toString() !== userId) {
      throw new ForbiddenException('Bạn không có quyền truy cập đơn hàng này');
    }

    return order;
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

      const shippingAddressData = shippingAddress;
      snapshotShippingAddress = {
        fullName: shippingAddressData.fullName,
        phone: shippingAddressData.phone,
        province: shippingAddressData.province,
        district: shippingAddressData.district,
        ward: shippingAddressData.ward,
        detail: shippingAddressData.detail,
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
      if (!item.quantity || item.quantity < 1) {
        throw new BadRequestException('quantity của từng item phải lớn hơn 0');
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

      const payment = await this.paymentsService.createForOrder(
        userId,
        order._id.toString(),
        order.orderCode,
        order.total,
        paymentMethod,
      );

      return { message: 'Tạo đơn hàng thành công', order, payment };
    } catch (err) {
      // Compensation: hoàn lại những gì đã ghi thành công trước khi lỗi xảy ra
      for (const { productId, quantity } of appliedStockChanges) {
        await this.productModel.findByIdAndUpdate(productId, {
          $inc: { stock: quantity, soldCount: -quantity },
        });
      }
      if (couponApplied) {
        await this.couponModel.findByIdAndUpdate(coupon, {
          $inc: { usedCount: -1 },
        });
      }
      throw err;
    }
  }

  async findAll(
    userId: string,
    query: string,
    current: number,
    pageSize: number,
  ) {
    const { filter, sort } = aqp(query);
    delete filter.current;
    delete filter.pageSize;

    filter.user = userId;

    if (!current) current = 1;
    if (!pageSize) pageSize = 10;

    const totalItems = await this.orderModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / pageSize);
    const skip = (current - 1) * pageSize;
    const results = await this.orderModel
      .find(filter)
      .limit(pageSize)
      .skip(skip)
      .sort(sort as any);

    return {
      meta: { current, pageSize, pages: totalPages, total: totalItems },
      results,
    };
  }

  async findOne(userId: string, _id: string) {
    return this.findOwnedOrThrow(_id, userId);
  }

  async findByOrderCode(userId: string, orderCode: string) {
    const normalizedOrderCode = orderCode?.trim();
    if (!normalizedOrderCode) {
      throw new BadRequestException('orderCode không được để trống');
    }

    const order = await this.orderModel.findOne({
      orderCode: normalizedOrderCode,
      user: userId,
    });
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    return order;
  }

  async update(userId: string, updateOrderDto: UpdateOrderDto) {
    const { _id, ...updateData } = updateOrderDto;

    await this.findOwnedOrThrow(_id, userId);

    if (
      updateData.status === OrderStatus.REFUNDED ||
      updateData.paymentStatus === PaymentStatus.REFUNDED
    ) {
      throw new BadRequestException(
        'Trạng thái hoàn tiền phải được xử lý qua refund service',
      );
    }

    // TODO: khi có role — chỉ admin được sửa status/paymentStatus;
    // user thường chỉ nên sửa shippingAddress/note, và chỉ khi status còn PENDING
    const updated = await this.orderModel.findByIdAndUpdate(
      _id,
      { ...updateData },
      { returnDocument: 'after', runValidators: true },
    );

    if (!updated) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    return { message: 'Cập nhật đơn hàng thành công', order: updated };
  }

  async remove(_id: string, userId: string) {
    await this.findOwnedOrThrow(_id, userId);

    const deleted = await this.orderModel.findByIdAndDelete(_id);
    if (!deleted) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    return { message: 'Xoá đơn hàng thành công' };
  }
}
