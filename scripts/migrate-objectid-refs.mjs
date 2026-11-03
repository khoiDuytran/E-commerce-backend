/**
 * Chuyển các field tham chiếu đang lưu dạng chuỗi sang ObjectId.
 *
 * Trước đây schema khai báo `type: Types.ObjectId` trong @Prop, Nest hiểu là Mixed
 * nên id được lưu nguyên dạng chuỗi. Sau khi đổi sang Schema.Types.ObjectId,
 * query sẽ ép kiểu sang ObjectId và không còn khớp với dữ liệu dạng chuỗi.
 *
 * Mặc định chỉ thống kê (dry run). Thêm --apply để ghi. Sao lưu database trước khi chạy.
 *
 *   node --env-file=.env scripts/migrate-objectid-refs.mjs --db <tên database>
 *   node --env-file=.env scripts/migrate-objectid-refs.mjs --db <tên database> --apply
 */
import mongoose from 'mongoose';

const HEX_ID = /^[a-f\d]{24}$/i;

// Field tham chiếu đơn: { collection: [path] }
const SCALAR_FIELDS = {
  addresses: ['user'],
  carts: ['user'],
  categories: ['parentId'],
  orders: ['user', 'addressId', 'coupon'],
  payments: ['orderId', 'userId'],
  productvariants: ['product'],
  products: ['category', 'brand'],
  refreshtokens: ['userId'],
  refunds: ['orderId', 'userId'],
  wishlists: ['user'],
};

// Mảng subdocument: { collection: { arrayPath: [field] } }
const SUBDOC_ARRAY_FIELDS = {
  carts: { items: ['product', 'variant'] },
  orders: { items: ['product', 'variant'] },
};

// Mảng id: { collection: [arrayPath] }
const ID_ARRAY_FIELDS = {
  wishlists: ['products'],
};

// Index unique trên field tham chiếu: chuyển kiểu có thể làm trùng khóa
const UNIQUE_FIELDS = {
  payments: 'orderId',
  carts: 'user',
  wishlists: 'user',
};

const toObjectIdExpr = (expr) => ({
  $cond: [
    {
      $and: [
        { $eq: [{ $type: expr }, 'string'] },
        { $regexMatch: { input: expr, regex: HEX_ID } },
      ],
    },
    { $toObjectId: expr },
    expr,
  ],
});

function parseArgs() {
  const args = process.argv.slice(2);
  const dbIndex = args.indexOf('--db');
  return {
    dbName: dbIndex >= 0 ? args[dbIndex + 1] : undefined,
    apply: args.includes('--apply'),
  };
}

async function countStringIds(col, path) {
  const [valid, invalid] = await Promise.all([
    col.countDocuments({ [path]: { $type: 'string', $regex: HEX_ID } }),
    col.countDocuments({
      [path]: { $type: 'string', $not: HEX_ID },
    }),
  ]);
  return { valid, invalid };
}

// Tìm giá trị unique sẽ bị trùng sau khi chuyển: cùng id có cả bản chuỗi và ObjectId
async function findUniqueConflicts(col, path) {
  return col
    .aggregate([
      { $match: { [path]: { $exists: true, $ne: null } } },
      { $group: { _id: { $toString: `$${path}` }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 20 },
    ])
    .toArray();
}

async function main() {
  const { dbName, apply } = parseArgs();
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Thiếu biến môi trường MONGODB_URI');
  if (!dbName) throw new Error('Thiếu tham số --db <tên database>');

  const client = new mongoose.mongo.MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));

  console.log(`Database: ${dbName} | Chế độ: ${apply ? 'GHI DỮ LIỆU' : 'dry run'}`);

  let blocked = false;
  for (const [name, path] of Object.entries(UNIQUE_FIELDS)) {
    if (!existing.has(name)) continue;
    const conflicts = await findUniqueConflicts(db.collection(name), path);
    if (conflicts.length > 0) {
      blocked = true;
      console.log(`! ${name}.${path}: ${conflicts.length} id bị trùng sau khi chuyển`, conflicts);
    }
  }
  if (blocked && apply) {
    console.log('Dừng: xử lý các bản ghi trùng ở trên trước khi chạy --apply.');
    await client.close();
    process.exitCode = 1;
    return;
  }

  let totalToFix = 0;
  for (const [name, paths] of Object.entries(SCALAR_FIELDS)) {
    if (!existing.has(name)) continue;
    const col = db.collection(name);
    for (const path of paths) {
      const { valid, invalid } = await countStringIds(col, path);
      totalToFix += valid;
      if (valid || invalid) {
        console.log(`${name}.${path}: ${valid} cần chuyển, ${invalid} chuỗi không phải id`);
      }
      if (apply && valid) {
        const res = await col.updateMany(
          { [path]: { $type: 'string', $regex: HEX_ID } },
          [{ $set: { [path]: { $toObjectId: `$${path}` } } }],
        );
        console.log(`  -> đã sửa ${res.modifiedCount}`);
      }
    }
  }

  for (const [name, arrays] of Object.entries(SUBDOC_ARRAY_FIELDS)) {
    if (!existing.has(name)) continue;
    const col = db.collection(name);
    for (const [arrayPath, fields] of Object.entries(arrays)) {
      const filter = {
        $or: fields.map((f) => ({
          [`${arrayPath}.${f}`]: { $type: 'string', $regex: HEX_ID },
        })),
      };
      const count = await col.countDocuments(filter);
      totalToFix += count;
      if (count) console.log(`${name}.${arrayPath}[].{${fields}}: ${count} document cần chuyển`);
      if (apply && count) {
        const setFields = Object.fromEntries(
          fields.map((f) => [f, toObjectIdExpr(`$$item.${f}`)]),
        );
        const res = await col.updateMany(filter, [
          {
            $set: {
              [arrayPath]: {
                $map: {
                  input: `$${arrayPath}`,
                  as: 'item',
                  in: { $mergeObjects: ['$$item', setFields] },
                },
              },
            },
          },
        ]);
        console.log(`  -> đã sửa ${res.modifiedCount}`);
      }
    }
  }

  for (const [name, arrayPaths] of Object.entries(ID_ARRAY_FIELDS)) {
    if (!existing.has(name)) continue;
    const col = db.collection(name);
    for (const arrayPath of arrayPaths) {
      const filter = { [arrayPath]: { $type: 'string', $regex: HEX_ID } };
      const count = await col.countDocuments(filter);
      totalToFix += count;
      if (count) console.log(`${name}.${arrayPath}[]: ${count} document cần chuyển`);
      if (apply && count) {
        const res = await col.updateMany(filter, [
          {
            $set: {
              [arrayPath]: {
                $map: { input: `$${arrayPath}`, as: 'id', in: toObjectIdExpr('$$id') },
              },
            },
          },
        ]);
        console.log(`  -> đã sửa ${res.modifiedCount}`);
      }
    }
  }

  console.log(
    apply
      ? 'Xong.'
      : `Tổng ${totalToFix} mục cần chuyển. Chạy lại với --apply để ghi.`,
  );
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
