import {
  LOW_STOCK_THRESHOLD,
  NotificationsService,
} from '../notifications/notifications.service.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import aqp from 'api-query-params';
import { Model, Types } from 'mongoose';
import {
  ProductVariant,
  ProductVariantDocument,
} from '../product-variants/schemas/product-variant.schema.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { Product, ProductDocument } from './schemas/product.schema.js';
import {
  Category,
  CategoryDocument,
} from '../categories/schemas/category.schema.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { Order, OrderDocument } from '../orders/schemas/order.schema.js';
import {
  Wishlist,
  WishlistDocument,
} from '../wishlist/schemas/wishlist.schema.js';
import {
  assertOriginalPrice,
  isDuplicateKeyErrorHelper,
  MAX_PAGE_SIZE,
  nullFieldsToUnset,
  removeQueryField,
  resolvePriceUpdate,
  validateIdFilter,
  stripUnsafeOperators,
  validateObjectIdHelper,
} from '../../helpers/utils.js';

@Injectable()
export class ProductService {
  constructor(
    private readonly notificationsService: NotificationsService,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(ProductVariant.name)
    private readonly variantModel: Model<ProductVariantDocument>,
    private readonly cloudinaryService: CloudinaryService,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Wishlist.name)
    private readonly wishlistModel: Model<WishlistDocument>,
  ) {}

  // Số biến thể của từng sản phẩm, để admin biết tồn kho nào đang tính từ biến thể
  private async countVariants(productIds: Types.ObjectId[]) {
    const rows = await this.variantModel.aggregate<{
      _id: Types.ObjectId;
      count: number;
    }>([
      { $match: { product: { $in: productIds } } },
      { $group: { _id: '$product', count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((row) => [String(row._id), row.count]));
  }

  private async validateCategory(categoryId?: string) {
    if (categoryId) {
      validateObjectIdHelper(categoryId);
      const categoryExists = await this.categoryModel.exists({
        _id: categoryId,
      });
      if (!categoryExists) {
        throw new BadRequestException('Danh mục không tồn tại');
      }
    }
  }

  async create(createProductDto: CreateProductDto) {
    assertOriginalPrice(
      createProductDto.basePrice,
      createProductDto.originalPrice,
    );
    await this.validateCategory(createProductDto.category);

    try {
      const product = await this.productModel.create(createProductDto);
      return { message: 'Tạo sản phẩm thành công', product };
    } catch (error) {
      if (isDuplicateKeyErrorHelper(error)) {
        throw new ConflictException('Slug sản phẩm đã tồn tại');
      }
      throw error;
    }
  }

  /** includeCost: chỉ endpoint admin mới lấy kèm giá nhập */
  async findAll(
    query: string,
    current: number,
    pageSize: number,
    includeCost = false,
  ) {
    const { filter, sort } = aqp(query);
    stripUnsafeOperators(filter);
    if (!includeCost) removeQueryField(filter, sort, 'costPrice');
    validateIdFilter(filter, 'category');
    delete filter.current;
    delete filter.pageSize;

    if (!current || current < 1) current = 1;
    pageSize =
      !pageSize || pageSize < 1 ? 10 : Math.min(pageSize, MAX_PAGE_SIZE);

    const totalItems = await this.productModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / pageSize);
    const skip = (current - 1) * pageSize;

    const results = await this.productModel
      .find(filter)
      .select(includeCost ? '+costPrice' : '')
      .limit(pageSize)
      .skip(skip)
      .sort(sort as any)
      .populate('category');

    if (!includeCost) {
      return {
        meta: { current, pageSize, pages: totalPages, total: totalItems },
        results,
      };
    }

    // Chỉ trang admin cần biết sản phẩm nào có biến thể
    const variantCounts = await this.countVariants(
      results.map((product) => product._id),
    );
    return {
      meta: { current, pageSize, pages: totalPages, total: totalItems },
      results: results.map((product) => ({
        ...product.toObject(),
        variantCount: variantCounts.get(String(product._id)) ?? 0,
      })),
    };
  }

  async findOne(id: string) {
    validateObjectIdHelper(id);

    const product = await this.productModel.findById(id).populate('category');

    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }
    return product;
  }

  async update(updateProductDto: UpdateProductDto) {
    const { _id, originalPrice, ...updateData } = updateProductDto as any;
    validateObjectIdHelper(_id);
    await this.validateCategory(updateProductDto.category);

    // Có biến thể thì tồn kho sản phẩm là tổng các biến thể, không nhận số nhập tay
    if (
      updateData.stock !== undefined &&
      (await this.variantModel.exists({ product: _id }))
    ) {
      delete updateData.stock;
    }

    // Đổi một trong hai giá thì so với giá còn lại đang lưu
    let priceUpdate: { $unset?: Record<string, 1> } = {};
    if (updateData.basePrice !== undefined || originalPrice !== undefined) {
      const current = await this.productModel
        .findById(_id)
        .select('basePrice originalPrice')
        .lean();
      if (!current) {
        throw new NotFoundException('Không tìm thấy sản phẩm');
      }
      priceUpdate = resolvePriceUpdate(
        { salePrice: current.basePrice, originalPrice: current.originalPrice },
        { salePrice: updateData.basePrice, originalPrice },
      );
      if (originalPrice != null) updateData.originalPrice = originalPrice;
    }

    try {
      const unset = {
        ...priceUpdate.$unset,
        ...nullFieldsToUnset(updateData, ['costPrice']),
      };
      const previous = await this.productModel.findByIdAndUpdate(
        _id,
        {
          ...updateData,
          ...(Object.keys(unset).length > 0 && { $unset: unset }),
        },
        { returnDocument: 'before', runValidators: true },
      );

      if (!previous) {
        throw new NotFoundException('Không tìm thấy sản phẩm');
      }

      const updated = await this.productModel.findById(_id);
      if (updateProductDto.images) {
        await this.cloudinaryService.deleteUnusedImages(
          previous.images.filter(
            (url) => !updateProductDto.images?.includes(url),
          ),
        );
      }

      // previous lấy bằng chính lệnh cập nhật nên chỉ một request thấy được thay đổi
      if (updated?.isActive) {
        if (previous.stock <= 0 && updated.stock > 0) {
          await this.notificationsService.notifyWishlistRestock(updated);
        }
        await this.notificationsService.notifyWishlistPriceDrop(
          updated,
          previous.basePrice,
          updated.basePrice,
        );
      }

      return { message: 'Cập nhật sản phẩm thành công', product: updated };
    } catch (error) {
      if (isDuplicateKeyErrorHelper(error)) {
        throw new ConflictException('Slug sản phẩm đã tồn tại');
      }
      throw error;
    }
  }

  /**
   * Chỉ xoá cứng sản phẩm chưa từng được đặt. Sản phẩm đã có đơn phải ẩn (isActive=false):
   * hủy đơn và nhận hàng hoàn cần cộng lại kho vào sản phẩm/biến thể, còn top bán chạy
   * đọc soldCount của sản phẩm, nên xoá đi sẽ làm mất kho và thống kê mà không báo lỗi.
   */
  async remove(id: string) {
    validateObjectIdHelper(id);

    const orderCount = await this.orderModel.countDocuments({
      'items.product': id,
    });
    if (orderCount > 0) {
      throw new ConflictException(
        `Sản phẩm đã có trong ${orderCount} đơn hàng nên không thể xoá. Hãy ẩn sản phẩm để ngừng bán mà vẫn giữ lịch sử đơn hàng.`,
      );
    }

    const deleted = await this.productModel.findByIdAndDelete(id);
    if (!deleted) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    // Xoá kèm biến thể để không còn biến thể mồ côi giữ SKU (SKU là unique)
    const variants = await this.variantModel
      .find({ product: id })
      .select('images')
      .lean();
    await this.variantModel.deleteMany({ product: id });
    await this.wishlistModel.updateMany(
      { products: id },
      { $pull: { products: id } },
    );

    // Dọn sau cùng: ảnh còn được nơi khác tham chiếu sẽ được giữ lại
    await this.cloudinaryService.deleteUnusedImages([
      ...deleted.images,
      ...variants.flatMap((variant) => variant.images ?? []),
    ]);

    return { message: 'Xoá sản phẩm thành công' };
  }

  async getStats() {
    const [total, active, lowStock, outOfStock, sold] = await Promise.all([
      this.productModel.countDocuments(),
      this.productModel.countDocuments({ isActive: true }),
      // Cùng ngưỡng với thông báo sắp hết hàng gửi cho admin
      this.productModel.countDocuments({
        stock: { $gt: 0, $lte: LOW_STOCK_THRESHOLD },
      }),
      this.productModel.countDocuments({ stock: { $lte: 0 } }),
      this.productModel.aggregate<{ sold: number }>([
        { $group: { _id: null, sold: { $sum: '$soldCount' } } },
      ]),
    ]);
    return {
      total,
      active,
      hidden: total - active,
      lowStock,
      outOfStock,
      lowStockThreshold: LOW_STOCK_THRESHOLD,
      sold: sold[0]?.sold ?? 0,
    };
  }
}
