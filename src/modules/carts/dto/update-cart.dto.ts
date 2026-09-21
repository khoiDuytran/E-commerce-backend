import {
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class UpdateCartDto {
  @IsMongoId()
  @IsNotEmpty()
  product: string;

  @IsMongoId()
  @IsOptional()
  variant?: string;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  quantity: number;
}
