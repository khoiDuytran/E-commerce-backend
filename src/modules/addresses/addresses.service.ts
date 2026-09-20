// src/models/address/address.service.ts
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateAddressDto } from './dto/create-address.dto.js';
import { UpdateAddressDto } from './dto/update-address.dto.js';
import { Address, AddressDocument } from './schemas/address.schema.js';
import { validateObjectIdHelper } from '../../helpers/utils.js';

@Injectable()
export class AddressesService {
  constructor(
    @InjectModel(Address.name)
    private readonly addressModel: Model<AddressDocument>,
  ) {}

  /**
   * Đảm bảo address tồn tại VÀ thuộc đúng user đang thao tác.
   * Dùng chung cho findOne/update/remove để tránh user A sửa/xoá địa chỉ của user B.
   */
  private async findOwnedOrThrow(id: string, userId: string) {
    validateObjectIdHelper(id);

    const address = await this.addressModel.findById(id);
    if (!address) {
      throw new NotFoundException('Không tìm thấy địa chỉ');
    }

    if (address.user.toString() !== userId) {
      throw new ForbiddenException('Bạn không có quyền truy cập địa chỉ này');
    }

    return address;
  }

  async create(userId: string, createAddressDto: CreateAddressDto) {
    const addressCount = await this.addressModel.countDocuments({
      user: userId,
    });
    const shouldBeDefault = addressCount === 0 || createAddressDto.isDefault;

    if (shouldBeDefault) {
      await this.unsetCurrentDefault(userId);
    }

    const address = await this.addressModel.create({
      ...createAddressDto,
      user: userId,
      isDefault: shouldBeDefault,
    });

    return { message: 'Thêm địa chỉ thành công', address };
  }

  async findAllByUser(userId: string) {
    const addresses = await this.addressModel
      .find({ user: userId })
      .sort({ isDefault: -1, createdAt: -1 });

    return { results: addresses };
  }

  async findOne(id: string, userId: string) {
    return this.findOwnedOrThrow(id, userId);
  }

  async update(userId: string, updateAddressDto: UpdateAddressDto) {
    const { _id, ...updateData } = updateAddressDto;

    await this.findOwnedOrThrow(_id, userId);

    if (updateData.isDefault === true) {
      await this.unsetCurrentDefault(userId);
    }

    const updated = await this.addressModel.findByIdAndUpdate(
      _id,
      { ...updateData },
      { returnDocument: 'after', runValidators: true },
    );

    if (!updated) {
      throw new NotFoundException('Không tìm thấy địa chỉ');
    }

    return { message: 'Cập nhật địa chỉ thành công', address: updated };
  }

  async remove(id: string, userId: string) {
    const address = await this.findOwnedOrThrow(id, userId);

    await this.addressModel.findByIdAndDelete(id);

    if (address.isDefault) {
      const fallback = await this.addressModel
        .findOne({ user: userId })
        .sort({ createdAt: -1 });

      if (fallback) {
        fallback.isDefault = true;
        await fallback.save();
      }
    }

    return { message: 'Xoá địa chỉ thành công' };
  }

  async setDefault(id: string, userId: string) {
    await this.findOwnedOrThrow(id, userId);

    await this.unsetCurrentDefault(userId);

    const updated = await this.addressModel.findByIdAndUpdate(
      id,
      { isDefault: true },
      { returnDocument: 'after' },
    );

    return { message: 'Đặt địa chỉ mặc định thành công', address: updated };
  }

  private async unsetCurrentDefault(userId: string) {
    await this.addressModel.updateMany(
      { user: userId, isDefault: true },
      { isDefault: false },
    );
  }
}
