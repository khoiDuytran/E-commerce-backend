import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  BANNER_MEDIA_TYPES,
  type BannerMediaType,
} from '../schemas/banner.schema.js';

// Đường dẫn nội bộ bắt đầu bằng một dấu "/" (không cho "//" vì là URL ngoài)
// hoặc URL http(s) đầy đủ
export const BANNER_LINK_PATTERN = /^(\/(?!\/)\S*|https?:\/\/\S+)$/;

export class CreateBannerDto {
  @IsString({ message: 'Tiêu đề không hợp lệ' })
  @IsNotEmpty({ message: 'Tiêu đề không được để trống' })
  @MaxLength(150, { message: 'Tiêu đề tối đa 150 ký tự' })
  title: string;

  @IsIn(BANNER_MEDIA_TYPES, { message: 'Loại banner phải là ảnh hoặc video' })
  mediaType: BannerMediaType;

  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { message: 'URL ảnh hoặc video không hợp lệ' },
  )
  mediaUrl: string;

  // null để xóa đường dẫn đã lưu
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString({ message: 'Đường dẫn không hợp lệ' })
  @MaxLength(500, { message: 'Đường dẫn tối đa 500 ký tự' })
  @Matches(BANNER_LINK_PATTERN, {
    message: 'Đường dẫn phải bắt đầu bằng "/" hoặc http(s)://',
  })
  link?: string | null;

  @IsOptional()
  @IsInt({ message: 'Thứ tự hiển thị phải là số nguyên' })
  @Min(0, { message: 'Thứ tự hiển thị không được âm' })
  @Max(9999, { message: 'Thứ tự hiển thị tối đa 9999' })
  sortOrder?: number;

  @IsOptional()
  @IsBoolean({ message: 'Trạng thái không hợp lệ' })
  isActive?: boolean;
}
