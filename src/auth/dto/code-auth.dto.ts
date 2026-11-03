import { IsMongoId, IsNotEmpty, IsString } from 'class-validator';
export class CodeAuthDto {
  @IsMongoId({ message: '_id không hợp lệ' })
  @IsNotEmpty({ message: '_id không được để trống' })
  _id: string;

  @IsString({ message: 'code không hợp lệ' })
  @IsNotEmpty({ message: 'code không được để trống' })
  code: string;
}
