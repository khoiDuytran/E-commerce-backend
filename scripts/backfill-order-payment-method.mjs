/**
 * Điền Order.paymentMethod cho đơn cũ từ collection payments.
 *
 * Trước đây phương thức thanh toán chỉ lưu ở Payment nên danh sách đơn của admin
 * không hiển thị hay lọc được. Đơn mới đã tự lưu field này; script chỉ cần chạy một lần.
 * Đơn không tìm thấy payment được liệt kê và giữ nguyên.
 *
 * Mặc định chỉ thống kê (dry run). Thêm --apply để ghi. Sao lưu database trước khi chạy.
 *
 *   node --env-file=.env scripts/backfill-order-payment-method.mjs --db <tên database>
 *   node --env-file=.env scripts/backfill-order-payment-method.mjs --db <tên database> --apply
 */
import mongoose from 'mongoose';

const PAYMENT_METHODS = ['COD', 'VNPAY'];

function parseArgs() {
  const args = process.argv.slice(2);
  const dbIndex = args.indexOf('--db');
  return {
    dbName: dbIndex >= 0 ? args[dbIndex + 1] : undefined,
    apply: args.includes('--apply'),
  };
}

async function main() {
  const { dbName, apply } = parseArgs();
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Thiếu biến môi trường MONGODB_URI');
  if (!dbName) throw new Error('Thiếu tham số --db <tên database>');

  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db;
  try {
    const orders = await db
      .collection('orders')
      .find(
        { paymentMethod: { $exists: false } },
        { projection: { orderCode: 1 } },
      )
      .toArray();

    // payment.orderId có thể lưu dạng chuỗi hoặc ObjectId nên so bằng chuỗi
    const payments = await db
      .collection('payments')
      .find(
        {
          orderId: {
            $in: [...orders.map((o) => o._id), ...orders.map((o) => String(o._id))],
          },
        },
        { projection: { orderId: 1, paymentMethod: 1 } },
      )
      .toArray();
    const methodByOrder = new Map(
      payments.map((p) => [String(p.orderId), p.paymentMethod]),
    );

    const counts = { COD: 0, VNPAY: 0 };
    const missing = [];
    const updates = [];
    for (const order of orders) {
      const method = methodByOrder.get(String(order._id));
      if (!PAYMENT_METHODS.includes(method)) {
        missing.push(order.orderCode ?? String(order._id));
        continue;
      }
      counts[method] += 1;
      updates.push({
        updateOne: {
          filter: { _id: order._id, paymentMethod: { $exists: false } },
          update: { $set: { paymentMethod: method } },
        },
      });
    }

    console.log(`${orders.length} đơn chưa có paymentMethod.`);
    console.log(`- COD: ${counts.COD}, VNPAY: ${counts.VNPAY}`);
    if (missing.length > 0) {
      console.log(
        `- ${missing.length} đơn không có payment hợp lệ, giữ nguyên: ${missing.join(', ')}`,
      );
    }

    if (apply && updates.length > 0) {
      const result = await db.collection('orders').bulkWrite(updates);
      console.log(`Đã ghi ${result.modifiedCount} đơn.`);
    } else {
      console.log(
        apply ? 'Không có gì để ghi.' : 'Dry run: chưa ghi gì. Thêm --apply để ghi.',
      );
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
