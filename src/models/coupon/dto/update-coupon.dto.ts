import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { DiscountType } from '../../../common/enums/discount-type.enum.js';
import { DATE_STRING_REGEX } from './date-string-regex.dto.js';

export class UpdateCouponDto {
  @IsMongoId({ message: '_id không hợp lệ' })
  @IsNotEmpty({ message: '_id không được để trống' })
  _id: string;

  @IsString()
  @IsOptional()
  code: string;

  @IsEnum(DiscountType)
  @IsOptional()
  discountType: DiscountType;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discountValue: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minOrderValue?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxDiscount?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  usageLimit: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  usedCount?: number;

  @IsString()
  @Matches(DATE_STRING_REGEX, {
    message: 'endDate không đúng định dạng yyyy-mm-dd hoặc yyyy/mm/dd',
  })
  @IsOptional()
  startDate: Date | string;

  @IsString()
  @Matches(DATE_STRING_REGEX, {
    message: 'endDate không đúng định dạng yyyy-mm-dd hoặc yyyy/mm/dd',
  })
  @IsOptional()
  endDate: Date | string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
