import {
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateAddressDto {
  @IsMongoId({ message: '_id không hợp lệ' })
  @IsNotEmpty({ message: '_id không được để trống' })
  _id: string;

  @IsNotEmpty()
  @MaxLength(100)
  fullName: string;

  @IsNotEmpty()
  @IsPhoneNumber('VN')
  phone: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  province: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  district: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  ward: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  detail?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
