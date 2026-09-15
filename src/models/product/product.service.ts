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
} from '../category/schemas/category.schema.js';
import { Brand, BrandDocument } from '../brand/schemas/brand.schema.js';
import {
  isDuplicateKeyErrorHelper,
  validateObjectIdHelper,
} from '../../helpers/utils.js';

@Injectable()
export class ProductService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(Brand.name)
    private readonly brandModel: Model<BrandDocument>,
  ) {}

  private async validateReferences(categoryId?: string, brandId?: string) {
    if (categoryId) {
      validateObjectIdHelper(categoryId);
      const categoryExists = await this.categoryModel.exists({
        _id: categoryId,
      });
      if (!categoryExists) {
        throw new BadRequestException('Danh mục không tồn tại');
      }
    }

    if (brandId) {
      validateObjectIdHelper(brandId);
      const brandExists = await this.brandModel.exists({ _id: brandId });
      if (!brandExists) {
        throw new BadRequestException('Thương hiệu không tồn tại');
      }
    }
  }

  async create(createProductDto: CreateProductDto) {
    await this.validateReferences(
      createProductDto.category,
      createProductDto.brand,
    );

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

  async findAll(query: string, current: number, pageSize: number) {
    const { filter, sort } = aqp(query);
    delete filter.current;
    delete filter.pageSize;

    if (!current) current = 1;
    if (!pageSize) pageSize = 10;

    const totalItems = await this.productModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / pageSize);
    const skip = (current - 1) * pageSize;

    const results = await this.productModel
      .find(filter)
      .limit(pageSize)
      .skip(skip)
      .sort(sort as any)
      .populate('category')
      .populate('brand');

    return {
      meta: { current, pageSize, pages: totalPages, total: totalItems },
      results,
    };
  }

  async findOne(id: string) {
    validateObjectIdHelper(id);

    const product = await this.productModel
      .findById(id)
      .populate('category')
      .populate('brand');

    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }
    return product;
  }

  async update(updateProductDto: UpdateProductDto) {
    const { _id, ...updateData } = updateProductDto as any;
    validateObjectIdHelper(_id);
    await this.validateReferences(
      updateProductDto.category,
      updateProductDto.brand,
    );

    try {
      const updated = await this.productModel.findByIdAndUpdate(
        _id,
        { ...updateData },
        { returnDocument: 'after', runValidators: true },
      );

      if (!updated) {
        throw new NotFoundException('Không tìm thấy sản phẩm');
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

    return { message: 'Xoá sản phẩm thành công' };
  }
}
