import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

export class CartItemDto {
  @IsMongoId()
  @IsNotEmpty()
  product: string;

  @IsMongoId()
  @IsOptional()
  variant?: string;

  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  quantity: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  priceAtAdd: number;
}

export class CreateCartDto {
  @IsMongoId()
  @IsNotEmpty()
  user: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items: CartItemDto[];
}
