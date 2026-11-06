import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import aqp from 'api-query-params';
import { Model } from 'mongoose';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import {
  MAX_PAGE_SIZE,
  stripUnsafeOperators,
  validateObjectIdHelper,
} from '../../helpers/utils.js';
import { CreateBannerDto } from './dto/create-banner.dto.js';
import { UpdateBannerDto } from './dto/update-banner.dto.js';
import {
  Banner,
  BannerDocument,
  BannerMediaType,
} from './schemas/banner.schema.js';

// Trang chủ chỉ hiển thị tối đa số banner này
export const MAX_ACTIVE_BANNERS = 10;

@Injectable()
export class BannersService {
  constructor(
    @InjectModel(Banner.name)
    private readonly bannerModel: Model<BannerDocument>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // File trên Cloudinary phải đúng loại đã chọn, tránh lưu video vào banner ảnh
  private assertMediaMatchesType(mediaUrl: string, mediaType: BannerMediaType) {
    const resource = this.cloudinaryService.getMediaResource(mediaUrl);
    if (resource && resource.resourceType !== mediaType) {
      throw new BadRequestException(
        mediaType === 'video'
          ? 'File đã tải lên không phải video'
          : 'File đã tải lên không phải ảnh',
      );
    }
  }

  async create(createBannerDto: CreateBannerDto) {
    const { link, ...data } = createBannerDto;
    this.assertMediaMatchesType(data.mediaUrl, data.mediaType);
    const banner = await this.bannerModel.create({
      ...data,
      ...(link ? { link } : {}),
    });
    return { message: 'Tạo banner thành công', banner };
  }

  async findAll(query: string, current: number, pageSize: number) {
    const { filter, sort } = aqp(query);
    stripUnsafeOperators(filter);
    delete filter.current;
    delete filter.pageSize;

    if (!current || current < 1) current = 1;
    pageSize =
      !pageSize || pageSize < 1 ? 10 : Math.min(pageSize, MAX_PAGE_SIZE);

    const totalItems = await this.bannerModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / pageSize);
    const skip = (current - 1) * pageSize;
    const results = await this.bannerModel
      .find(filter)
      .limit(pageSize)
      .skip(skip)
      .sort((sort as any) ?? { sortOrder: 1, createdAt: -1 });

    return {
      meta: { current, pageSize, pages: totalPages, total: totalItems },
      results,
    };
  }

  // Dữ liệu public cho trang chủ: chỉ banner đang bật và chỉ field cần hiển thị
  findActive() {
    return this.bannerModel
      .find({ isActive: true })
      .select('title mediaType mediaUrl link')
      .sort({ sortOrder: 1, createdAt: -1 })
      .limit(MAX_ACTIVE_BANNERS)
      .lean();
  }

  async findOne(_id: string) {
    validateObjectIdHelper(_id);
    const banner = await this.bannerModel.findById(_id);
    if (!banner) throw new NotFoundException('Không tìm thấy banner');
    return banner;
  }

  async update(updateBannerDto: UpdateBannerDto) {
    const { _id, link, ...updateData } = updateBannerDto;
    validateObjectIdHelper(_id);

    const previous = await this.bannerModel.findById(_id);
    if (!previous) throw new NotFoundException('Không tìm thấy banner');

    this.assertMediaMatchesType(
      updateData.mediaUrl ?? previous.mediaUrl,
      updateData.mediaType ?? previous.mediaType,
    );

    // link là null hoặc rỗng khi xóa đường dẫn đã lưu, undefined khi không đổi
    const update =
      link === null || link === ''
        ? { $set: updateData, $unset: { link: 1 } }
        : { $set: { ...updateData, ...(link !== undefined ? { link } : {}) } };

    const banner = await this.bannerModel.findByIdAndUpdate(_id, update, {
      returnDocument: 'after',
      runValidators: true,
    });
    if (!banner) throw new NotFoundException('Không tìm thấy banner');

    if (previous.mediaUrl !== banner.mediaUrl) {
      await this.cloudinaryService.deleteUnusedImages([previous.mediaUrl]);
    }

    return { message: 'Cập nhật banner thành công', banner };
  }

  async remove(_id: string) {
    validateObjectIdHelper(_id);
    const deleted = await this.bannerModel.findByIdAndDelete(_id);
    if (!deleted) throw new NotFoundException('Không tìm thấy banner');

    await this.cloudinaryService.deleteUnusedImages([deleted.mediaUrl]);
    return { message: 'Xóa banner thành công' };
  }
}
