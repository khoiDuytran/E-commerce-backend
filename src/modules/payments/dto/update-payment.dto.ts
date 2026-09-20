import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { CreatePaymentDto } from './create-payment.dto.js';
import { PaymentTransactionStatus } from '../../../common/enums/payment-transaction-status.enum.js';

// Không cho đổi order sau khi đã tạo payment
export class UpdatePaymentDto extends PartialType(
  OmitType(CreatePaymentDto, ['orderId'] as const),
) {
  @IsMongoId({ message: '_id không đúng định dạng' })
  @IsNotEmpty()
  _id: string;

  @IsOptional()
  @IsEnum(PaymentTransactionStatus)
  status?: PaymentTransactionStatus;

  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  paidAt?: Date;

  @IsOptional()
  @IsObject()
  gatewayResponse?: Record<string, any>;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;
}
