/**
 * Đồng bộ tồn kho của sản phẩm có biến thể = tổng tồn các biến thể đang bật.
 *
 * Trước đây tồn kho của sản phẩm có biến thể là số admin nhập tay và không bao giờ
 * thay đổi khi bán, nên nhãn "Hết hàng", thống kê và cảnh báo tồn kho bị sai.
 * Từ nay backend tự cập nhật số này; script chỉ cần chạy một lần cho dữ liệu cũ.
 * Sản phẩm không có biến thể không bị đụng tới.
 *
 * Mặc định chỉ thống kê (dry run). Thêm --apply để ghi. Sao lưu database trước khi chạy.
 *
 *   node --env-file=.env scripts/sync-product-stock.mjs --db <tên database>
 *   node --env-file=.env scripts/sync-product-stock.mjs --db <tên database> --apply
 */
import mongoose from 'mongoose';

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
    const totals = await db
      .collection('productvariants')
      .aggregate([
        {
          $group: {
            _id: '$product',
            stock: { $sum: { $cond: ['$isActive', '$stock', 0] } },
            variants: { $sum: 1 },
          },
        },
      ])
      .toArray();

    const products = db.collection('products');
    let changed = 0;
    for (const { _id, stock, variants } of totals) {
      const product = await products.findOne(
        { _id },
        { projection: { name: 1, stock: 1 } },
      );
      if (!product) {
        console.log(`- Bỏ qua ${variants} biến thể mồ côi của sản phẩm ${_id}`);
        continue;
      }
      if (product.stock === stock) continue;
      changed += 1;
      console.log(`- ${product.name}: ${product.stock} -> ${stock}`);
      if (apply) await products.updateOne({ _id }, { $set: { stock } });
    }

    console.log(
      `\n${totals.length} sản phẩm có biến thể, ${changed} sản phẩm lệch tồn kho.`,
    );
    console.log(apply ? 'Đã ghi thay đổi.' : 'Dry run: chưa ghi gì. Thêm --apply để ghi.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
