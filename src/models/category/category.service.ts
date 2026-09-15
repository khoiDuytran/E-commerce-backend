import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import aqp from 'api-query-params';
import mongoose, { Model } from 'mongoose';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { Category, CategoryDocument } from './schemas/category.schema.js';
import {
  isDuplicateKeyErrorHelper,
  validateObjectIdHelper,
} from '../../helpers/utils.js';

@Injectable()
export class CategoryService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
  ) {}

  async create(createCategoryDto: CreateCategoryDto) {
    const { parent } = createCategoryDto as any;

    if (parent) {
      validateObjectIdHelper(parent);
      const parentExists = await this.categoryModel.exists({ _id: parent });
      if (!parentExists) {
        throw new BadRequestException('Danh mục cha không tồn tại');
      }
    }

    try {
      const category = await this.categoryModel.create({
        ...createCategoryDto,
        parentId: createCategoryDto.parentId,
      });
      return { message: 'Tạo danh mục thành công', category };
    } catch (error) {
      if (isDuplicateKeyErrorHelper(error))
        throw new ConflictException('Slug danh mục đã tồn tại');
      throw error;
    }
  }

  async findAll(query: string, current: number, pageSize: number) {
    const { filter, sort } = aqp(query);
    delete filter.current;
    delete filter.pageSize;

    if (!current) current = 1;
    if (!pageSize) pageSize = 10;

    const totalItems = await this.categoryModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / pageSize);
    const skip = (current - 1) * pageSize;
    const results = await this.categoryModel
      .find(filter)
      .limit(pageSize)
      .skip(skip)
      .sort(sort as any);

    return {
      meta: { current, pageSize, pages: totalPages, total: totalItems },
      results,
    };
  }

  async findOne(_id: string) {
    validateObjectIdHelper(_id);
    const category = await this.categoryModel.findById(_id);
    if (!category) throw new NotFoundException('Không tìm thấy danh mục');
    return category;
  }

  async update(updateCategoryDto: UpdateCategoryDto) {
    const { _id, ...updateData } = updateCategoryDto as any;
    validateObjectIdHelper(_id);

    if (updateData.parent) {
      validateObjectIdHelper(updateData.parent);

      // Không cho phép danh mục tự làm cha của chính nó
      if (updateData.parent === _id) {
        throw new BadRequestException('Danh mục không thể là cha của chính nó');
      }

      const parentExists = await this.categoryModel.exists({
        _id: updateData.parent,
      });
      if (!parentExists) {
        throw new BadRequestException('Danh mục cha không tồn tại');
      }
    }

    try {
      const updated = await this.categoryModel.findByIdAndUpdate(
        _id,
        { ...updateData },
        { returnDocument: 'after', runValidators: true },
      );

      if (!updated) {
        throw new NotFoundException('Không tìm thấy danh mục');
      }

      return { message: 'Cập nhật danh mục thành công', category: updated };
    } catch (error) {
      if (isDuplicateKeyErrorHelper(error))
        throw new ConflictException('Slug danh mục đã tồn tại');
      throw error;
    }
  }

  async remove(_id: string) {
    validateObjectIdHelper(_id);

    const hasChildren = await this.categoryModel.exists({ parent: _id });
    if (hasChildren) {
      throw new BadRequestException(
        'Không thể xoá danh mục đang có danh mục con. Vui lòng xoá hoặc chuyển danh mục con trước.',
      );
    }

    const deleted = await this.categoryModel.findByIdAndDelete(_id);
    if (!deleted) {
      throw new NotFoundException('Không tìm thấy danh mục');
    }

    return { message: 'Xoá danh mục thành công' };
  }
}
