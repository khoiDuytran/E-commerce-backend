import { Model, Types } from 'mongoose';
import type { ProductDocument } from '../modules/products/schemas/product.schema.js';
import type { ProductVariantDocument } from '../modules/product-variants/schemas/product-variant.schema.js';

/**
 * Sản phẩm có biến thể thì tồn kho của sản phẩm là tổng tồn các biến thể đang bật,
 * chỉ để hiển thị và thống kê; kho thật được trừ ở từng biến thể.
 *
 * Dùng khi admin thêm/sửa/xoá biến thể. Luồng đặt hàng và hoàn kho dùng $inc
 * để không ghi đè lẫn nhau khi nhiều đơn chạy cùng lúc.
 * Trả về false khi sản phẩm không có biến thể: tồn kho do admin tự nhập.
 */
export const syncProductStockFromVariants = async (
  productModel: Model<ProductDocument>,
  variantModel: Model<ProductVariantDocument>,
  productId: string | Types.ObjectId,
) => {
  const id = new Types.ObjectId(String(productId));
  const [summary] = await variantModel.aggregate<{ stock: number }>([
    { $match: { product: id } },
    {
      $group: {
        _id: null,
        stock: { $sum: { $cond: ['$isActive', '$stock', 0] } },
      },
    },
  ]);
  if (!summary) return false;
  await productModel.updateOne({ _id: id }, { stock: summary.stock });
  return true;
};

/**
 * Cộng lại kho cho một dòng hàng (hủy đơn, hoàn tác khi tạo đơn lỗi, nhận hàng trả).
 * Biến thể: cộng ở biến thể, và cộng vào tổng của sản phẩm nếu biến thể đang bật
 * (biến thể tắt hoặc đã xoá không nằm trong tổng). soldCount luôn ở sản phẩm.
 */
export const restockItem = async (
  productModel: Model<ProductDocument>,
  variantModel: Model<ProductVariantDocument>,
  productId: string | Types.ObjectId,
  variantId: string | Types.ObjectId | undefined | null,
  quantity: number,
) => {
  let addToProduct = !variantId;
  if (variantId) {
    const variant = await variantModel.findByIdAndUpdate(
      variantId,
      { $inc: { stock: quantity } },
      { returnDocument: 'after' },
    );
    addToProduct = !!variant?.isActive;
  }
  await productModel.findByIdAndUpdate(productId, {
    $inc: {
      ...(addToProduct ? { stock: quantity } : {}),
      soldCount: -quantity,
    },
  });
};
