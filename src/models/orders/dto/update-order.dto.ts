import { Type } from 'class-transformer';
import {
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { OrderStatus } from '../../../common/enums/order-status.enum.js';
import { PaymentStatus } from '../../../common/enums/payment-status.enum.js';
import { ShippingAddressDto } from './create-order.dto.js';

export class UpdateOrderDto {
  @IsMongoId({ message: '_id không hợp lệ' })
  @IsNotEmpty({ message: '_id không được để trống' })
  _id: string;

  @IsEnum(OrderStatus, { message: 'status không hợp lệ' })
  @IsOptional()
  status?: OrderStatus;

  @IsEnum(PaymentStatus, { message: 'paymentStatus không hợp lệ' })
  @IsOptional()
  paymentStatus?: PaymentStatus;

  @ValidateNested()
  @Type(() => ShippingAddressDto)
  @IsOptional()
  shippingAddress?: ShippingAddressDto;

  @IsString()
  @IsOptional()
  note?: string;
}
