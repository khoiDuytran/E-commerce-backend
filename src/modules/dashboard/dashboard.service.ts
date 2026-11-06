import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OrderStatus } from '../../common/enums/order-status.enum.js';
import { PaymentStatus } from '../../common/enums/payment-status.enum.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { Order, OrderDocument } from '../orders/schemas/order.schema.js';
import { Product, ProductDocument } from '../products/schemas/product.schema.js';
import { User } from '../users/schemas/user.schema.js';
import { Refund, RefundDocument } from '../refunds/schemas/refund.schema.js';
import { RefundStatus } from '../../common/enums/refund-status.enum.js';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(Refund.name)
    private readonly refundModel: Model<RefundDocument>,
  ) { }

  /**
   * Lợi nhuận gộp = (tiền hàng - giảm giá) - giá vốn, trên các đơn được tính doanh thu.
   * Giá vốn lấy từ snapshot lúc đặt. Đơn có dòng hàng chưa có giá vốn (đơn cũ hoặc
   * sản phẩm chưa nhập giá nhập) không tính được lợi nhuận nên bị loại và đếm riêng.
   */
  private async getProfitStats(
    validOrderMatch: Record<string, unknown>,
    ranges: { thisMonth: object; lastMonth: object },
  ) {
    const summarize = (match: object) => [
      { $match: { ...match, hasAllCosts: true } },
      {
        $group: {
          _id: null,
          netSales: { $sum: '$netSales' },
          cost: { $sum: '$cost' },
          orders: { $sum: 1 },
        },
      },
    ];
    const [result] = await this.orderModel.aggregate<{
      total: { netSales: number; cost: number; orders: number }[];
      thisMonth: { netSales: number; cost: number; orders: number }[];
      lastMonth: { netSales: number; cost: number; orders: number }[];
      missingCost: { count: number }[];
    }>([
      { $match: validOrderMatch },
      {
        $addFields: {
          netSales: { $subtract: ['$subtotal', { $ifNull: ['$discount', 0] }] },
          cost: {
            $sum: {
              $map: {
                input: '$items',
                as: 'item',
                in: {
                  $multiply: [
                    { $ifNull: ['$$item.costPrice', 0] },
                    '$$item.quantity',
                  ],
                },
              },
            },
          },
          hasAllCosts: {
            $allElementsTrue: [
              {
                $map: {
                  input: '$items',
                  as: 'item',
                  in: { $isNumber: '$$item.costPrice' },
                },
              },
            ],
          },
        },
      },
      {
        $facet: {
          total: summarize({}),
          thisMonth: summarize({ createdAt: ranges.thisMonth }),
          lastMonth: summarize({ createdAt: ranges.lastMonth }),
          missingCost: [
            { $match: { hasAllCosts: false } },
            { $count: 'count' },
          ],
        },
      },
    ]);

    const toProfit = (rows?: { netSales: number; cost: number; orders: number }[]) => {
      const row = rows?.[0];
      const netSales = row?.netSales ?? 0;
      const profit = netSales - (row?.cost ?? 0);
      return {
        profit,
        netSales,
        orders: row?.orders ?? 0,
        // Biên lợi nhuận gộp theo %, làm tròn 1 chữ số; null khi chưa có doanh số
        margin: netSales > 0 ? Math.round((profit / netSales) * 1000) / 10 : null,
      };
    };

    return {
      total: toProfit(result?.total),
      thisMonth: toProfit(result?.thisMonth),
      lastMonth: toProfit(result?.lastMonth),
      ordersMissingCost: result?.missingCost[0]?.count ?? 0,
    };
  }

  async getStats() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const validOrderMatch = {
      status: { $nin: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] },
      $or: [
        { status: OrderStatus.DELIVERED },
        { paymentStatus: PaymentStatus.PAID },
      ],
    };

    const [
      revenueStats,
      orderCounts,
      userStats,
      productStats,
      revenueLast7Days,
      topSellingProducts,
      recentPendingOrders,
      lowStockList,
      pendingRefundsCount,
    ] = await Promise.all([
      // 1. Doanh thu tổng, hôm nay, tháng này, tháng trước
      this.orderModel.aggregate([
        {
          $facet: {
            total: [
              { $match: validOrderMatch },
              { $group: { _id: null, sum: { $sum: '$total' } } },
            ],
            today: [
              {
                $match: {
                  ...validOrderMatch,
                  createdAt: { $gte: startOfToday },
                },
              },
              { $group: { _id: null, sum: { $sum: '$total' } } },
            ],
            thisMonth: [
              {
                $match: {
                  ...validOrderMatch,
                  createdAt: { $gte: startOfThisMonth },
                },
              },
              { $group: { _id: null, sum: { $sum: '$total' } } },
            ],
            lastMonth: [
              {
                $match: {
                  ...validOrderMatch,
                  createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
                },
              },
              { $group: { _id: null, sum: { $sum: '$total' } } },
            ],
          },
        },
      ]),

      // 2. Thống kê số lượng đơn theo từng trạng thái
      this.orderModel.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),

      // 3. Thống kê khách hàng
      Promise.all([
        this.userModel.countDocuments({ role: UserRole.USER }),
        this.userModel.countDocuments({
          role: UserRole.USER,
          createdAt: { $gte: startOfThisMonth },
        }),
      ]),

      // 4. Thống kê sản phẩm & tồn kho
      Promise.all([
        this.productModel.countDocuments({ isActive: true }),
        this.productModel.countDocuments({ stock: { $lte: 5 } }),
      ]),

      // 5. Biểu đồ doanh thu 7 ngày gần nhất
      this.orderModel.aggregate([
        {
          $match: {
            ...validOrderMatch,
            createdAt: { $gte: sevenDaysAgo },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            revenue: { $sum: '$total' },
            ordersCount: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // 6. Top 5 sản phẩm bán chạy nhất
      this.productModel
        .find({ isActive: true })
        .sort({ soldCount: -1 })
        .limit(5)
        .select('_id name slug images basePrice stock soldCount'),

      // 7. 5 đơn hàng mới nhất đang chờ duyệt
      this.orderModel
        .find({ status: OrderStatus.PENDING })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('_id orderCode shippingAddress total status paymentStatus createdAt items'),

      // 8. 5 sản phẩm có tồn kho thấp nhất
      this.productModel
        .find({ stock: { $lte: 10 } })
        .sort({ stock: 1 })
        .limit(5)
        .select('_id name slug basePrice stock images'),

      // 9. Số lượng yêu cầu hoàn hàng đang chờ duyệt
      this.refundModel.countDocuments({ status: RefundStatus.REQUESTED }),
    ]);

    // 10. Lợi nhuận gộp (chạy riêng để giữ nguyên kiểu của Promise.all ở trên)
    const profit = await this.getProfitStats(validOrderMatch, {
      thisMonth: { $gte: startOfThisMonth },
      lastMonth: { $gte: startOfLastMonth, $lte: endOfLastMonth },
    });

    // Parse revenue
    const totalRev = revenueStats[0]?.total[0]?.sum || 0;
    const todayRev = revenueStats[0]?.today[0]?.sum || 0;
    const thisMonthRev = revenueStats[0]?.thisMonth[0]?.sum || 0;
    const lastMonthRev = revenueStats[0]?.lastMonth[0]?.sum || 0;

    // Parse order status counts
    const statusMap: Record<string, number> = {};
    let totalOrdersCount = 0;
    orderCounts.forEach((item) => {
      statusMap[item._id] = item.count;
      totalOrdersCount += item.count;
    });

    return {
      kpi: {
        revenue: {
          total: totalRev,
          today: todayRev,
          thisMonth: thisMonthRev,
          lastMonth: lastMonthRev,
        },
        orders: {
          total: totalOrdersCount,
          pending: statusMap[OrderStatus.PENDING] || 0,
          confirmed: statusMap[OrderStatus.CONFIRMED] || 0,
          shipping: statusMap[OrderStatus.SHIPPING] || 0,
          delivered: statusMap[OrderStatus.DELIVERED] || 0,
          cancelled: statusMap[OrderStatus.CANCELLED] || 0,
          refunded: (statusMap[OrderStatus.REFUNDED] || 0) + (statusMap[OrderStatus.RETURN_REQUESTED] || 0),
        },
        customers: {
          total: userStats[0],
          newThisMonth: userStats[1],
        },
        products: {
          activeTotal: productStats[0],
          lowStockTotal: productStats[1],
        },
        pendingRefunds: pendingRefundsCount,
        profit,
      },
      charts: {
        revenueLast7Days,
        statusDistribution: Object.entries(statusMap).map(([status, count]) => ({
          status,
          count,
        })),
      },
      topSellingProducts,
      recentPendingOrders,
      lowStockList,
    };
  }
}

