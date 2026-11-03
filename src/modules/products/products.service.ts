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
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { Product, ProductDocument } from './schemas/product.schema.js';
import {
  Category,
  CategoryDocument,
} from '../categories/schemas/category.schema.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
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
    private readonly cloudinaryService: CloudinaryService,
  ) {}

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

    return {
      meta: { current, pageSize, pages: totalPages, total: totalItems },
      results,
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

  async remove(id: string) {
    validateObjectIdHelper(id);

    const deleted = await this.productModel.findByIdAndDelete(id);
    if (!deleted) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    await this.cloudinaryService.deleteUnusedImages(deleted.images);

    return { message: 'Xoá sản phẩm thành công' };
  }
}
