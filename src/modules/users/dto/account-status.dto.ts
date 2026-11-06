import { IsNotEmpty, IsString } from 'class-validator';

export class DisableAccountDto {
  @IsString({ message: 'code không hợp lệ' })
  @IsNotEmpty({ message: 'code không được để trống' })
  code: string;
}

export class RestoreAccountDto {
  @IsString({ message: 'email không hợp lệ' })
  @IsNotEmpty({ message: 'email không được để trống' })
  email: string;

  @IsString({ message: 'code không hợp lệ' })
  @IsNotEmpty({ message: 'code không được để trống' })
  code: string;
}
