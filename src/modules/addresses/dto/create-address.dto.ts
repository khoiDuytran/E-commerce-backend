import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAddressDto {
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
  detail: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
