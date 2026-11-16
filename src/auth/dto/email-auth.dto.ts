import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class EmailAuthDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsString({ message: 'email không hợp lệ' })
  @IsNotEmpty({ message: 'email không được để trống' })
  email: string;
}
