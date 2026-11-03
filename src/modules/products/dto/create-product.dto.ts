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

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
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
  category: string;

  @IsArray()
  @IsUrl({}, { each: true })
  @IsOptional()
  images?: string[];

  @IsNumber()
  @Min(0)
  basePrice: number;

  // Giá trước giảm (không bắt buộc), phải lớn hơn hoặc bằng giá bán
  @IsNumber({}, { message: 'Giá trước giảm phải là số' })
  @Min(0, { message: 'Giá trước giảm không được âm' })
  @IsOptional()
  originalPrice?: number;

  // Giá nhập (không bắt buộc), chỉ admin thấy
  @IsNumber({}, { message: 'Giá nhập phải là số' })
  @Min(0, { message: 'Giá nhập không được âm' })
  @IsOptional()
  costPrice?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  stock: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
