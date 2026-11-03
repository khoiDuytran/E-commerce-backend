import { NotificationsService } from '../notifications/notifications.service.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import aqp from 'api-query-params';
import { Model } from 'mongoose';
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
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import {
  Product,
  ProductDocument,
} from '../products/schemas/product.schema.js';
import { CreateProductVariantDto } from './dto/create-product-variant.dto.js';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto.js';
import {
  ProductVariant,
  ProductVariantDocument,
} from './schemas/product-variant.schema.js';

@Injectable()
export class ProductVariantsService {
  constructor(
    private readonly notificationsService: NotificationsService,
    @InjectModel(ProductVariant.name)
    private readonly productVariantModel: Model<ProductVariantDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  private async ensureProductExists(productId: string) {
    validateObjectIdHelper(productId);
    const exists = await this.productModel.exists({ _id: productId });
    if (!exists) {
      throw new BadRequestException('Sản phẩm không tồn tại');
    }
  }

  async create(dto: CreateProductVariantDto) {
    assertOriginalPrice(dto.price, dto.originalPrice);
    await this.ensureProductExists(dto.product);

    try {
      const variant = await this.productVariantModel.create(dto);
      return { message: 'Tạo biến thể sản phẩm thành công', variant };
    } catch (error) {
      if (isDuplicateKeyErrorHelper(error)) {
        throw new ConflictException('SKU hoặc tên biến thể đã tồn tại');
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
    validateIdFilter(filter, 'product');
    delete filter.current;
    delete filter.pageSize;

    if (!current || current < 1) current = 1;
    pageSize =
      !pageSize || pageSize < 1 ? 10 : Math.min(pageSize, MAX_PAGE_SIZE);

    const totalItems = await this.productVariantModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / pageSize);
    const skip = (current - 1) * pageSize;
    const results = await this.productVariantModel
      .find(filter)
      .select(includeCost ? '+costPrice' : '')
      .limit(pageSize)
      .skip(skip)
      .sort(sort as any)
      .populate('product');

    return {
      meta: { current, pageSize, pages: totalPages, total: totalItems },
      results,
    };
  }

  async findOne(id: string) {
    validateObjectIdHelper(id);
    const variant = await this.productVariantModel
      .findById(id)
      .populate('product');
    if (!variant) {
      throw new NotFoundException('Không tìm thấy biến thể sản phẩm');
    }
    return variant;
  }

  async update(dto: UpdateProductVariantDto) {
    const { _id, originalPrice, ...rest } = dto;
    validateObjectIdHelper(_id);
    const updateData: Record<string, unknown> = { ...rest };

    // Đổi một trong hai giá thì so với giá còn lại đang lưu
    let priceUpdate: { $unset?: Record<string, 1> } = {};
    if (rest.price !== undefined || originalPrice !== undefined) {
      const current = await this.productVariantModel
        .findById(_id)
        .select('price originalPrice')
        .lean();
      if (!current) {
        throw new NotFoundException('Không tìm thấy biến thể sản phẩm');
      }
      priceUpdate = resolvePriceUpdate(
        { salePrice: current.price, originalPrice: current.originalPrice },
        { salePrice: rest.price, originalPrice },
      );
      if (originalPrice != null) updateData.originalPrice = originalPrice;
    }

    try {
      const unset = {
        ...priceUpdate.$unset,
        ...nullFieldsToUnset(updateData, ['costPrice']),
      };
      const previous = await this.productVariantModel.findByIdAndUpdate(
        _id,
        {
          ...updateData,
          ...(Object.keys(unset).length > 0 && { $unset: unset }),
        },
        { returnDocument: 'before', runValidators: true },
      );
      if (!previous) {
        throw new NotFoundException('Không tìm thấy biến thể sản phẩm');
      }
      const updated = await this.productVariantModel.findById(_id);
      if (dto.images) {
        await this.cloudinaryService.deleteUnusedImages(
          previous.images.filter((url) => !dto.images?.includes(url)),
        );
      }
      if (updated) await this.notifyWishlist(previous, updated);
      return {
        message: 'Cập nhật biến thể sản phẩm thành công',
        variant: updated,
      };
    } catch (error) {
      if (isDuplicateKeyErrorHelper(error)) {
        throw new ConflictException('SKU hoặc tên biến thể đã tồn tại');
      }
      throw error;
    }
  }

  /** Báo cho khách có sản phẩm trong wishlist khi biến thể có hàng lại hoặc giảm giá */
  private async notifyWishlist(
    previous: ProductVariantDocument,
    updated: ProductVariantDocument,
  ) {
    const restocked = previous.stock <= 0 && updated.stock > 0;
    const priceDropped = updated.price < previous.price;
    if (!updated.isActive || (!restocked && !priceDropped)) return;

    const product = await this.productModel
      .findOne({ _id: updated.product, isActive: true })
      .select('name slug');
    if (!product) return;

    if (restocked) {
      await this.notificationsService.notifyWishlistRestock(
        product,
        updated.name,
      );
    }
    await this.notificationsService.notifyWishlistPriceDrop(
      product,
      previous.price,
      updated.price,
      updated.name,
    );
  }

  async remove(id: string) {
    validateObjectIdHelper(id);
    const deleted = await this.productVariantModel.findByIdAndDelete(id);
    if (!deleted) {
      throw new NotFoundException('Không tìm thấy biến thể sản phẩm');
    }
    await this.cloudinaryService.deleteUnusedImages(deleted.images);
    return { message: 'Xoá biến thể sản phẩm thành công' };
  }
}
