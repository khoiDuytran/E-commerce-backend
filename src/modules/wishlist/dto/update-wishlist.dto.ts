import { IsArray, IsMongoId, IsNotEmpty } from 'class-validator';

export class UpdateWishlistDto {
  @IsArray()
  @IsMongoId({ each: true })
  @IsNotEmpty()
  products: string[];
}
