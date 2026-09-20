import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { DiscountType } from '../../../common/enums/discount-type.enum.js';
import { DATE_STRING_REGEX } from './date-string-regex.dto.js';

export class CreateCouponDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsEnum(DiscountType)
  @IsNotEmpty()
  discountType: DiscountType;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
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
  @IsNotEmpty()
  usageLimit: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  usedCount?: number;

  @IsString()
  @Matches(DATE_STRING_REGEX, {
    message: 'startDate không đúng định dạng yyyy-mm-dd hoặc yyyy/mm/dd',
  })
  @IsNotEmpty()
  startDate: Date | string;

  @IsString()
  @Matches(DATE_STRING_REGEX, {
    message: 'endDate không đúng định dạng yyyy-mm-dd hoặc yyyy/mm/dd',
  })
  @IsNotEmpty()
  endDate: Date | string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
