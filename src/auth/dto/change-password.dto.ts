import { IsNotEmpty, IsString } from 'class-validator';

export class ChangePasswordAuthDto {
  @IsString({ message: 'code không hợp lệ' })
  @IsNotEmpty({ message: 'code không được để trống' })
  code: string;

  @IsString({ message: 'password không hợp lệ' })
  @IsNotEmpty({ message: 'password không được để trống' })
  password: string;

  @IsString({ message: 'confirmPassword không hợp lệ' })
  @IsNotEmpty({ message: 'confirmPassword không được để trống' })
  confirmPassword: string;

  @IsString({ message: 'email không hợp lệ' })
  @IsNotEmpty({ message: 'email không được để trống' })
  email: string;
}
