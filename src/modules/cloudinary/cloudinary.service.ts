import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { Model } from 'mongoose';
import {
  Category,
  CategoryDocument,
} from '../categories/schemas/category.schema.js';
import { Order, OrderDocument } from '../orders/schemas/order.schema.js';
import {
  ProductVariant,
  ProductVariantDocument,
} from '../product-variants/schemas/product-variant.schema.js';
import {
  Product,
  ProductDocument,
} from '../products/schemas/product.schema.js';
import { User, UserDocument } from '../users/schemas/user.schema.js';
import {
  Banner,
  BannerDocument,
} from '../banners/schemas/banner.schema.js';

// Chỉ ảnh trong thư mục này mới được hệ thống xóa
const IMAGE_FOLDER = 'e-commerce';
// Cloudinary kiểm tra định dạng thật của file; không cho SVG vì có thể chứa script
const ALLOWED_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'avif'];
const ALLOWED_VIDEO_FORMATS = ['mp4', 'webm', 'mov'];
// Chữ ký upload video chỉ dùng được trong khoảng thời gian ngắn
const VIDEO_SIGNATURE_TTL_SECONDS = 10 * 60;

type MediaResourceType = 'image' | 'video';

interface MediaResource {
  publicId: string;
  resourceType: MediaResourceType;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly cloudName?: string;
  private readonly apiKey?: string;
  private readonly apiSecret?: string;
  private readonly isConfigured: boolean;

  constructor(
    configService: ConfigService,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(ProductVariant.name)
    private readonly variantModel: Model<ProductVariantDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Banner.name)
    private readonly bannerModel: Model<BannerDocument>,
  ) {
    this.cloudName = configService.get<string>('CLOUDINARY_CLOUD_NAME');
    this.apiKey = configService.get<string>('CLOUDINARY_API_KEY');
    this.apiSecret = configService.get<string>('CLOUDINARY_API_SECRET');
    this.isConfigured = Boolean(this.cloudName && this.apiKey && this.apiSecret);

    if (this.isConfigured) {
      cloudinary.config({
        cloud_name: this.cloudName,
        api_key: this.apiKey,
        api_secret: this.apiSecret,
        secure: true,
      });
    }
  }

  async uploadImage(buffer: Buffer) {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        'Hệ thống chưa cấu hình Cloudinary',
      );
    }

    try {
      const url = await new Promise<string>((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              resource_type: 'image',
              // Đặt public_id tường minh để URL giống nhau ở mọi chế độ thư mục của Cloudinary
              public_id: `${IMAGE_FOLDER}/${randomUUID()}`,
              allowed_formats: ALLOWED_FORMATS,
            },
            (error, result) => {
              if (result?.secure_url) resolve(result.secure_url);
              else reject(error ?? new Error('Cloudinary không trả về URL'));
            },
          )
          .end(buffer);
      });
      return { message: 'Tải ảnh lên thành công', url };
    } catch (error) {
      const { http_code: httpCode, message } = error as {
        http_code?: number;
        message?: string;
      };
      this.logger.error(`Tải ảnh lên Cloudinary thất bại: ${message}`);
      if (httpCode === 400) {
        throw new BadRequestException('File không phải ảnh hợp lệ');
      }
      throw new BadGatewayException('Không thể tải ảnh lên Cloudinary');
    }
  }

  // Video có thể nặng hàng chục MB nên trình duyệt tải thẳng lên Cloudinary
  // bằng chữ ký này, thay vì đi qua server action và backend
  createVideoUploadSignature() {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        'Hệ thống chưa cấu hình Cloudinary',
      );
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const params = {
      timestamp,
      public_id: `${IMAGE_FOLDER}/${randomUUID()}`,
      allowed_formats: ALLOWED_VIDEO_FORMATS.join(','),
    };
    const signature = cloudinary.utils.api_sign_request(
      params,
      this.apiSecret!,
    );

    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/video/upload`,
      apiKey: this.apiKey,
      signature,
      expiresIn: VIDEO_SIGNATURE_TTL_SECONDS,
      ...params,
    };
  }

  // Trả về null nếu URL không phải ảnh hoặc video do hệ thống này tải lên
  getMediaResource(url: string): MediaResource | null {
    if (!this.isConfigured) return null;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.hostname !== 'res.cloudinary.com') return null;

    const resourceType = (['image', 'video'] as const).find((type) =>
      parsed.pathname.startsWith(`/${this.cloudName}/${type}/upload/`),
    );
    if (!resourceType) return null;

    const prefix = `/${this.cloudName}/${resourceType}/upload/`;
    const publicId = parsed.pathname
      .slice(prefix.length)
      .replace(/^v\d+\//, '')
      .replace(/\.[a-z0-9]+$/i, '');
    if (!publicId.startsWith(`${IMAGE_FOLDER}/`)) return null;
    return { publicId, resourceType };
  }

  getPublicId(url: string): string | null {
    return this.getMediaResource(url)?.publicId ?? null;
  }

  // Đơn hàng cũ lưu snapshot URL ảnh, nên ảnh còn được tham chiếu ở đâu thì phải giữ lại
  private async findUsedUrls(urls: string[]) {
    const lists = await Promise.all([
      this.productModel.distinct('images', { images: { $in: urls } }),
      this.variantModel.distinct('images', { images: { $in: urls } }),
      this.orderModel.distinct('items.image', { 'items.image': { $in: urls } }),
      this.categoryModel.distinct('image', { image: { $in: urls } }),
      this.userModel.distinct('image', { image: { $in: urls } }),
      this.bannerModel.distinct('mediaUrl', { mediaUrl: { $in: urls } }),
    ]);
    return new Set<unknown>(lists.flat());
  }

  // Dọn ảnh (và video banner) không được làm hỏng thao tác chính,
  // nên lỗi chỉ ghi log và không ném ra
  async deleteUnusedImages(urls: string[]): Promise<{ deleted: string[] }> {
    const candidates = [...new Set(urls)].filter((url) =>
      this.getPublicId(url),
    );
    if (candidates.length === 0) return { deleted: [] };

    try {
      const usedUrls = await this.findUsedUrls(candidates);
      const unused = candidates.filter((url) => !usedUrls.has(url));
      const results = await Promise.allSettled(
        unused.map((url) => {
          const { publicId, resourceType } = this.getMediaResource(url)!;
          return cloudinary.uploader.destroy(publicId, {
            resource_type: resourceType,
            invalidate: true,
          });
        }),
      );

      const deleted = unused.filter((url, index) => {
        const result = results[index];
        if (result.status === 'fulfilled') return true;
        this.logger.error(
          `Không xóa được ảnh ${url}: ${result.reason?.message}`,
        );
        return false;
      });
      return { deleted };
    } catch (error) {
      this.logger.error(`Lỗi khi dọn ảnh: ${(error as Error).message}`);
      return { deleted: [] };
    }
  }
}
