import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAuthDto {
  @IsString({ message: 'email không hợp lệ' })
  @IsNotEmpty({ message: 'email không được để trống' })
  email: string;

  @IsString({ message: 'password không hợp lệ' })
  @IsNotEmpty({ message: 'password không được để trống' })
  password: string;

  @IsString({ message: 'name không hợp lệ' })
  @IsOptional()
  name: string;
}

export class LoginAuthDto {
  @IsString({ message: 'email không hợp lệ' })
  @IsNotEmpty({ message: 'email không được để trống' })
  email: string;

  @IsString({ message: 'password không hợp lệ' })
  @IsNotEmpty({ message: 'password không được để trống' })
  password: string;
}

export interface IUserPayload {
  _id: string;
  email: string;
  name: string;
  role: string;
}
