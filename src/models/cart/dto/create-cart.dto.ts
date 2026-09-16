import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  Min,
  ValidateNested,
} from 'class-validator';

export class CartItemDto {
  @IsMongoId()
  @IsNotEmpty()
  product: string;

  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  quantity: number;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
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
