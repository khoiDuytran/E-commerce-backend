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
  isDuplicateKeyErrorHelper,
  validateObjectIdHelper,
} from '../../helpers/utils.js';
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
    @InjectModel(ProductVariant.name)
    private readonly productVariantModel: Model<ProductVariantDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  private async ensureProductExists(productId: string) {
    validateObjectIdHelper(productId);
    const exists = await this.productModel.exists({ _id: productId });
    if (!exists) {
      throw new BadRequestException('Sản phẩm không tồn tại');
    }
  }

  async create(dto: CreateProductVariantDto) {
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

  async findAll(query: string, current: number, pageSize: number) {
    const { filter, sort } = aqp(query);
    delete filter.current;
    delete filter.pageSize;

    if (!current) current = 1;
    if (!pageSize) pageSize = 10;

    const totalItems = await this.productVariantModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / pageSize);
    const skip = (current - 1) * pageSize;
    const results = await this.productVariantModel
      .find(filter)
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
    const { _id, ...updateData } = dto;
    validateObjectIdHelper(_id);

    try {
      const updated = await this.productVariantModel.findByIdAndUpdate(
        _id,
        updateData,
        { returnDocument: 'after', runValidators: true },
      );
      if (!updated) {
        throw new NotFoundException('Không tìm thấy biến thể sản phẩm');
      }
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

  async remove(id: string) {
    validateObjectIdHelper(id);
    const deleted = await this.productVariantModel.findByIdAndDelete(id);
    if (!deleted) {
      throw new NotFoundException('Không tìm thấy biến thể sản phẩm');
    }
    return { message: 'Xoá biến thể sản phẩm thành công' };
  }
}
