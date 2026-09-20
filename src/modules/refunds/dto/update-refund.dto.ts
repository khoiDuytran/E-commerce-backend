import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { RefundStatus } from '../../../common/enums/refund-status.enum.js';

export class UpdateRefundDto {
  @IsEnum(RefundStatus)
  status: RefundStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminNote?: string;
}