import {
  IsArray,
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';

export class UpdateProductDto {
  @IsMongoId({ message: '_id không hợp lệ' })
  @IsNotEmpty({ message: '_id không được để trống' })
  _id: string;

  @IsString()
  @IsOptional()
  name: string;

  @IsString()
  @IsOptional()
  slug: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  sizeGuide?: string;

  @IsString()
  @IsOptional()
  detailsFit?: string;

  @IsMongoId()
  @IsOptional()
  category: string;

  @IsArray()
  @IsUrl({}, { each: true })
  @IsOptional()
  images?: string[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  basePrice: number;

  // Giá trước giảm (không bắt buộc), phải lớn hơn hoặc bằng giá bán. Gửi null để xoá
  @IsNumber({}, { message: 'Giá trước giảm phải là số' })
  @Min(0, { message: 'Giá trước giảm không được âm' })
  @IsOptional()
  originalPrice?: number | null;

  // Giá nhập (không bắt buộc), chỉ admin thấy. Gửi null để xoá
  @IsNumber({}, { message: 'Giá nhập phải là số' })
  @Min(0, { message: 'Giá nhập không được âm' })
  @IsOptional()
  costPrice?: number | null;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  stock: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
