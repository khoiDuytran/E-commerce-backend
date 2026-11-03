import {
  IsArray,
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';

export class CreateProductVariantDto {
  @IsMongoId({ message: 'product không hợp lệ' })
  product: string;

  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsObject()
  attributes: Record<string, string>;

  @IsNumber()
  @Min(0)
  price: number;

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

  @IsNumber()
  @Min(0)
  @IsOptional()
  stock?: number;

  @IsArray()
  @IsUrl({}, { each: true })
  @IsOptional()
  images?: string[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
