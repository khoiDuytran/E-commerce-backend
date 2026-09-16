import { IsMongoId, IsNotEmpty, IsNumber, Min } from 'class-validator';

export class UpdateCartDto {
  @IsMongoId()
  @IsNotEmpty()
  product: string;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  quantity: number;
}
