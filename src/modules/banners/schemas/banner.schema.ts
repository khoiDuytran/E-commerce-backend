import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const BANNER_MEDIA_TYPES = ['image', 'video'] as const;
export type BannerMediaType = (typeof BANNER_MEDIA_TYPES)[number];

export type BannerDocument = HydratedDocument<Banner>;

@Schema({ timestamps: true })
export class Banner {
  // Dùng làm tên quản lý và nội dung thay thế cho ảnh
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ type: String, required: true, enum: BANNER_MEDIA_TYPES })
  mediaType: BannerMediaType;

  @Prop({ required: true })
  mediaUrl: string;

  // Đường dẫn khi khách bấm vào banner: đường dẫn nội bộ hoặc URL https
  @Prop()
  link?: string;

  // Số nhỏ hiển thị trước
  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const BannerSchema = SchemaFactory.createForClass(Banner);

// Trang chủ lấy banner đang bật theo thứ tự hiển thị
BannerSchema.index({ isActive: 1, sortOrder: 1 });
