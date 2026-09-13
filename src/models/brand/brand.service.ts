import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import aqp from 'api-query-params';
import mongoose, { Model } from 'mongoose';
import { CreateBrandDto } from './dto/create-brand.dto.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';
import { Brand, BrandDocument } from './schemas/brand.schema.js';
import {
  isDuplicateKeyErrorHelper,
  validateObjectIdHelper,
} from '../../helpers/utils.js';

@Injectable()
export class BrandService {
  constructor(
    @InjectModel(Brand.name)
    private readonly brandModel: Model<BrandDocument>,
  ) {}

  async create(createBrandDto: CreateBrandDto) {
    try {
      const brand = await this.brandModel.create(createBrandDto);
      return { message: 'Tạo thương hiệu thành công', brand };
    } catch (error) {
      if (isDuplicateKeyErrorHelper(error)) {
        throw new ConflictException('Slug thương hiệu đã tồn tại');
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

    const totalItems = await this.brandModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / pageSize);
    const skip = (current - 1) * pageSize;
    const results = await this.brandModel
      .find(filter)
      .limit(pageSize)
      .skip(skip)
      .sort(sort as any);

    return {
      meta: { current, pageSize, pages: totalPages, total: totalItems },
      results,
    };
  }

  async findOne(id: string) {
    validateObjectIdHelper(id);

    const brand = await this.brandModel.findById(id);
    if (!brand) {
      throw new NotFoundException('Không tìm thấy thương hiệu');
    }
    return brand;
  }

  async update(updateBrandDto: UpdateBrandDto) {
    const { _id, ...updateData } = updateBrandDto as any;
    validateObjectIdHelper(_id);

    try {
      const updated = await this.brandModel.findByIdAndUpdate(
        _id,
        { ...updateData },
        { new: true, runValidators: true },
      );

      if (!updated) {
        throw new NotFoundException('Không tìm thấy thương hiệu');
      }

      return { message: 'Cập nhật thương hiệu thành công', brand: updated };
    } catch (error) {
      if (isDuplicateKeyErrorHelper(error)) {
        throw new ConflictException('Slug thương hiệu đã tồn tại');
      }
      throw error;
    }
  }

  async remove(_id: string) {
    validateObjectIdHelper(_id);

    const deleted = await this.brandModel.findByIdAndDelete(_id);
    if (!deleted) {
      throw new NotFoundException('Không tìm thấy thương hiệu');
    }

    return { message: 'Xoá thương hiệu thành công' };
  }
}
