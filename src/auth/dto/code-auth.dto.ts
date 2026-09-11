import { IsNotEmpty } from 'class-validator';
export class CodeAuthDto {
  @IsNotEmpty({ message: '_id không được để trống' })
  _id: string;

  @IsNotEmpty({ message: 'code không được để trống' })
  code: string;
}
