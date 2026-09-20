import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '../../../common/enums/payment-method.enum.js';

export class OrderItemDto {
  @IsMongoId({ message: 'product không hợp lệ' })
  @IsNotEmpty({ message: 'product không được để trống' })
  product: string;

  @IsNumber({}, { message: 'quantity phải là số' })
  @Min(1, { message: 'quantity phải lớn hơn 0' })
  quantity: number;
}

export class ShippingAddressDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  province: string;

  @IsString()
  @IsNotEmpty()
  district: string;

  @IsString()
  @IsNotEmpty()
  ward: string;

  @IsString()
  @IsNotEmpty()
  detail: string;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'items không được rỗng' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  // Chọn 1 trong 2: dùng address có sẵn trong sổ (addressId) hoặc nhập địa chỉ mới (shippingAddress)
  @ValidateIf((dto) => !dto.shippingAddress)
  @IsMongoId({ message: 'addressId không hợp lệ' })
  @IsNotEmpty({ message: 'Phải cung cấp addressId hoặc shippingAddress' })
  addressId?: string;

  @ValidateIf((dto) => !dto.addressId)
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;

  @IsMongoId({ message: 'coupon không hợp lệ' })
  @IsOptional()
  coupon?: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsNotEmpty()
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  // status, paymentStatus: KHÔNG nhận từ client — service tự gán mặc định (PENDING)
  // shippingFee: KHÔNG nhận từ client — tính server-side dựa trên địa chỉ/giỏ hàng
}
