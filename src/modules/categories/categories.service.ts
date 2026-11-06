import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import aqp from 'api-query-params';
import { Model } from 'mongoose';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { Category, CategoryDocument } from './schemas/category.schema.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import {
  isDuplicateKeyErrorHelper,
  MAX_PAGE_SIZE,
  stripUnsafeOperators,
  validateObjectIdHelper,
} from '../../helpers/utils.js';

@Injectable()
export class CategoryService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async create(createCategoryDto: CreateCategoryDto) {
    const { parentId } = createCategoryDto;

    if (parentId) {
      validateObjectIdHelper(parentId);
      const parentExists = await this.categoryModel.exists({ _id: parentId });
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
    stripUnsafeOperators(filter);
    delete filter.current;
    delete filter.pageSize;

    if (!current || current < 1) current = 1;
    pageSize =
      !pageSize || pageSize < 1 ? 10 : Math.min(pageSize, MAX_PAGE_SIZE);

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
    const { _id, ...updateData } = updateCategoryDto;
    validateObjectIdHelper(_id);

    if (updateData.parentId) {
      validateObjectIdHelper(updateData.parentId);

      // Không cho phép danh mục tự làm cha của chính nó
      if (updateData.parentId === _id) {
        throw new BadRequestException('Danh mục không thể là cha của chính nó');
      }

      const parentExists = await this.categoryModel.exists({
        _id: updateData.parentId,
      });
      if (!parentExists) {
        throw new BadRequestException('Danh mục cha không tồn tại');
      }
    }

    try {
      const previous = await this.categoryModel.findByIdAndUpdate(
        _id,
        { ...updateData },
        { returnDocument: 'before', runValidators: true },
      );

      if (!previous) {
        throw new NotFoundException('Không tìm thấy danh mục');
      }

      const updated = await this.categoryModel.findById(_id);
      // image là undefined khi request không đổi ảnh, là null khi xóa ảnh
      if (
        updateCategoryDto.image !== undefined &&
        previous.image &&
        previous.image !== updateCategoryDto.image
      ) {
        await this.cloudinaryService.deleteUnusedImages([previous.image]);
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

    const hasChildren = await this.categoryModel.exists({ parentId: _id });
    if (hasChildren) {
      throw new BadRequestException(
        'Không thể xoá danh mục đang có danh mục con. Vui lòng xoá hoặc chuyển danh mục con trước.',
      );
    }

    const deleted = await this.categoryModel.findByIdAndDelete(_id);
    if (!deleted) {
      throw new NotFoundException('Không tìm thấy danh mục');
    }

    if (deleted.image) {
      await this.cloudinaryService.deleteUnusedImages([deleted.image]);
    }

    return { message: 'Xoá danh mục thành công' };
  }

  async getStats() {
    const [total, active, root] = await Promise.all([
      this.categoryModel.countDocuments(),
      this.categoryModel.countDocuments({ isActive: true }),
      this.categoryModel.countDocuments({ parentId: null }),
    ]);
    return {
      total,
      active,
      hidden: total - active,
      root,
      children: total - root,
    };
  }
}
