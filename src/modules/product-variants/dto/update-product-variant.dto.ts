import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsMongoId,
  Min,
} from 'class-validator';

export class UpdateProductVariantDto {
  @IsMongoId({ message: '_id không hợp lệ' })
  @IsNotEmpty({ message: '_id không được để trống' })
  _id: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsObject()
  @IsOptional()
  attributes?: Record<string, string>;

  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

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
