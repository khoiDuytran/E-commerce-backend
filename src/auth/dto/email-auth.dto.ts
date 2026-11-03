import { IsNotEmpty, IsString } from 'class-validator';

export class EmailAuthDto {
  @IsString({ message: 'email không hợp lệ' })
  @IsNotEmpty({ message: 'email không được để trống' })
  email: string;
}
