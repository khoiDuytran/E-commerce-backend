import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ResetCodeDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsString({ message: 'email không hợp lệ' })
  @IsNotEmpty({ message: 'email không được để trống' })
  email: string;

  @IsString({ message: 'code không hợp lệ' })
  @IsNotEmpty({ message: 'code không được để trống' })
  code: string;
}
