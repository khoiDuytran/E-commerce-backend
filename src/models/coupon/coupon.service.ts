import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import aqp from 'api-query-params';
import { Model } from 'mongoose';
import { CreateCouponDto } from './dto/create-coupon.dto.js';
import { UpdateCouponDto } from './dto/update-coupon.dto.js';
import { Coupon, CouponDocument } from './schemas/coupon.schema.js';
import {
  isDuplicateKeyErrorHelper,
  validateObjectIdHelper,
} from '../../helpers/utils.js';

@Injectable()
export class CouponService {
  constructor(
    @InjectModel(Coupon.name)
    private readonly couponModel: Model<CouponDocument>,
  ) {}

  async create(createCouponDto: CreateCouponDto) {
    try {
      const coupon = await this.couponModel.create(createCouponDto);
      return { message: 'Tạo mã giảm giá thành công', coupon };
    } catch (error) {
      if (isDuplicateKeyErrorHelper(error)) {
        throw new ConflictException('Mã giảm giá đã tồn tại');
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

    const totalItems = await this.couponModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / pageSize);
    const skip = (current - 1) * pageSize;
    const results = await this.couponModel
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

    const coupon = await this.couponModel.findById(_id);
    if (!coupon) {
      throw new NotFoundException('Không tìm thấy mã giảm giá');
    }

    return coupon;
  }

  async update(updateCouponDto: UpdateCouponDto) {
    const { _id, ...updateData } = updateCouponDto as any;
    validateObjectIdHelper(_id);

    try {
      const updated = await this.couponModel.findByIdAndUpdate(
        _id,
        { ...updateData },
        { returnDocument: 'after', runValidators: true },
      );

      if (!updated) {
        throw new NotFoundException('Không tìm thấy mã giảm giá');
      }

      return { message: 'Cập nhật mã giảm giá thành công', coupon: updated };
    } catch (error) {
      if (isDuplicateKeyErrorHelper(error)) {
        throw new ConflictException('Mã giảm giá đã tồn tại');
      }
      throw error;
    }
  }

  async remove(_id: string) {
    validateObjectIdHelper(_id);

    const deleted = await this.couponModel.findByIdAndDelete(_id);
    if (!deleted) {
      throw new NotFoundException('Không tìm thấy mã giảm giá');
    }

    return { message: 'Xoá mã giảm giá thành công' };
  }
}
