import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import aqp from 'api-query-params';
import { OrderStatus } from '../../common/enums/order-status.enum.js';
import { PaymentStatus } from '../../common/enums/payment-status.enum.js';
import { PaymentTransactionStatus } from '../../common/enums/payment-transaction-status.enum.js';
import { RefundStatus } from '../../common/enums/refund-status.enum.js';
import {
  stripUnsafeOperators,
  validateObjectIdHelper,
} from '../../helpers/utils.js';
import { restockItem } from '../../helpers/product-stock.js';
import { Order, OrderDocument } from '../orders/schemas/order.schema.js';
import {
  Payment,
  PaymentDocument,
  paymentOrderFilter,
} from '../payments/schemas/payment.schema.js';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';
import { VnpayService } from '../../integrations/vnpay/vnpay.service.js';
import {
  Product,
  ProductDocument,
} from '../products/schemas/product.schema.js';
import {
  ProductVariant,
  ProductVariantDocument,
} from '../product-variants/schemas/product-variant.schema.js';
import { CreateRefundDto } from './dto/create-refund.dto.js';
import { UpdateRefundDto } from './dto/update-refund.dto.js';
import { Refund, RefundDocument } from './schemas/refund.schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    @InjectModel(Refund.name)
    private readonly refundModel: Model<RefundDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(ProductVariant.name)
    private readonly productVariantModel: Model<ProductVariantDocument>,
    private readonly vnpayService: VnpayService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** findByIdAndUpdate trả bản trước khi cập nhật, nên truyền trạng thái mới vào */
  private notifyOrder(order: OrderDocument | null, status: OrderStatus) {
    if (!order) return;
    return this.notificationsService.notifyOrderStatus({
      _id: order._id,
      user: order.user,
      orderCode: order.orderCode,
      status,
    });
  }

  private async paginate(
    baseFilter: Record<string, unknown>,
    query: Record<string, any>,
    current?: number,
    pageSize?: number,
    populateUser = false,
  ) {
    const { filter, sort } = aqp(query);
    stripUnsafeOperators(filter);
    delete filter.current;
    delete filter.pageSize;

    Object.assign(filter, baseFilter);

    const page =
      Number.isInteger(current) && (current as number) > 0
        ? (current as number)
        : 1;
    const size =
      Number.isInteger(pageSize) && (pageSize as number) > 0
        ? Math.min(pageSize as number, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;

    const sortOption =
      sort && Object.keys(sort).length > 0 ? sort : { createdAt: -1 };

    const query$ = this.refundModel
      .find(filter)
      .sort(sortOption as any)
      .skip((page - 1) * size)
      .limit(size)
      .populate('orderId');
    if (populateUser) query$.populate('userId', 'name email');
    const [totalItems, results] = await Promise.all([
      this.refundModel.countDocuments(filter),
      query$,
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

  async create(userId: string, dto: CreateRefundDto) {
    const order = await this.orderModel.findOne({
      orderCode: dto.orderCode,
      user: userId,
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('Chỉ có thể hoàn hàng sau khi đơn đã giao');
    }
    if (order.paymentStatus !== PaymentStatus.PAID) {
      throw new BadRequestException(
        'Chỉ có thể hoàn hàng với đơn đã thanh toán',
      );
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
    await this.notifyOrder(order, OrderStatus.RETURN_REQUESTED);
    await this.notificationsService.notifyAdminsRefundRequested(
      order,
      dto.reason,
    );
    return refund;
  }

  async findAllForUser(
    userId: string,
    query: Record<string, any>,
    current?: number,
    pageSize?: number,
  ) {
    return this.paginate({ userId }, query, current, pageSize);
  }

  /**
   * Kèm phương thức thanh toán để admin biết bước hoàn tiền sẽ gọi VNPay
   * hay phải tự hoàn tay (COD), và thông tin khách đã gửi yêu cầu.
   */
  async findAllForAdmin(
    query: Record<string, any>,
    current?: number,
    pageSize?: number,
  ) {
    const page = await this.paginate({}, query, current, pageSize, true);
    const orderIds = page.results.map((refund) => refund.orderId?._id ?? refund.orderId);
    const payments = await this.paymentModel
      .find({ orderId: { $in: orderIds } })
      .select('orderId paymentMethod status')
      .lean();
    const paymentByOrder = new Map(
      payments.map((payment) => [String(payment.orderId), payment]),
    );
    return {
      ...page,
      results: page.results.map((refund) => {
        const payment = paymentByOrder.get(
          String(refund.orderId?._id ?? refund.orderId),
        );
        return {
          ...refund.toObject(),
          paymentMethod: payment?.paymentMethod ?? null,
          paymentStatus: payment?.status ?? null,
        };
      }),
    };
  }

  async findOne(id: string, userId?: string, isAdmin = false) {
    validateObjectIdHelper(id);
    const filter = isAdmin ? { _id: id } : { _id: id, userId };
    const refund = await this.refundModel.findOne(filter).populate('orderId');
    if (!refund) throw new NotFoundException('Không tìm thấy yêu cầu hoàn');
    return refund;
  }

  async update(id: string, dto: UpdateRefundDto) {
    // Admin duyệt/cập nhật refund dựa theo ID đơn hoàn (không phụ thuộc userId của admin)
    validateObjectIdHelper(id);
    const refund = await this.refundModel.findById(id);
    if (!refund) throw new NotFoundException('Không tìm thấy yêu cầu hoàn');
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

    // Chuyển trạng thái nguyên tử: 2 request cùng lúc thì chỉ 1 request thắng,
    // tránh cộng kho hoặc hoàn tiền 2 lần.
    const previousStatus = refund.status;
    const claimed = await this.refundModel.findOneAndUpdate(
      { _id: id, status: previousStatus },
      {
        status: dto.status,
        ...(dto.adminNote !== undefined && { adminNote: dto.adminNote }),
        ...(dto.status === RefundStatus.REFUNDED && { refundedAt: new Date() }),
      },
      { returnDocument: 'after' },
    );
    if (!claimed) {
      throw new BadRequestException(
        'Yêu cầu hoàn vừa được cập nhật. Vui lòng tải lại',
      );
    }

    if (dto.status === RefundStatus.REFUNDED) {
      const payment = await this.paymentModel.findOne(
        paymentOrderFilter(refund.orderId),
      );
      if (
        payment?.paymentMethod === PaymentMethod.VNPAY &&
        payment.status === PaymentTransactionStatus.SUCCESS
      ) {
        try {
          claimed.gatewayResponse = await this.vnpayService.refund({
            orderCode: payment.orderCode,
            amount: claimed.refundAmount,
            transactionNo: payment.transactionId ?? '',
            transactionDate: payment.gatewayResponse?.vnp_PayDate ?? '',
            createdBy: 'admin',
          });
          await claimed.save();
        } catch (error) {
          // Trả lại trạng thái để admin có thể thử lại
          await this.refundModel.updateOne(
            { _id: id },
            { status: previousStatus, $unset: { refundedAt: 1 } },
          );
          this.logger.error(
            `Không hoàn được tiền VNPay cho đơn ${payment.orderCode}`,
            error instanceof Error ? error.stack : String(error),
          );
          throw new BadGatewayException(
            'Không thể hoàn tiền qua VNPay lúc này. Vui lòng thử lại',
          );
        }
      }
      const order = await this.orderModel.findByIdAndUpdate(refund.orderId, {
        status: OrderStatus.REFUNDED,
        paymentStatus: PaymentStatus.REFUNDED,
      });
      await this.paymentModel.findOneAndUpdate(
        paymentOrderFilter(refund.orderId),
        { status: PaymentTransactionStatus.REFUNDED },
      );
      await this.notifyOrder(order, OrderStatus.REFUNDED);
    } else if (dto.status === RefundStatus.APPROVED) {
      const order = await this.orderModel.findByIdAndUpdate(refund.orderId, {
        status: OrderStatus.RETURN_APPROVED,
      });
      await this.notifyOrder(order, OrderStatus.RETURN_APPROVED);
    } else if (dto.status === RefundStatus.RECEIVED) {
      const order = await this.orderModel.findByIdAndUpdate(refund.orderId, {
        status: OrderStatus.RETURN_RECEIVED,
      });
      if (order) await this.restock(order);
      await this.notifyOrder(order, OrderStatus.RETURN_RECEIVED);
    } else if (dto.status === RefundStatus.REJECTED) {
      const order = await this.orderModel.findByIdAndUpdate(refund.orderId, {
        status: OrderStatus.RETURN_REJECTED,
      });
      await this.notifyOrder(order, OrderStatus.RETURN_REJECTED);
    }

    return claimed;
  }

  /** Hàng đã về kho. Không throw để không chặn luồng hoàn; lỗi được log để xử lý thủ công. */
  private async restock(order: OrderDocument) {
    for (const { product, variant, quantity } of order.items) {
      try {
        await restockItem(
          this.productModel,
          this.productVariantModel,
          product,
          variant,
          quantity,
        );
      } catch (error) {
        this.logger.error(
          `Không hoàn được kho cho sản phẩm ${product.toString()} (+${quantity})`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
