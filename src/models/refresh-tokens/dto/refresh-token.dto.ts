import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsNotEmpty({ message: 'refreshToken không được để trống' })
  @IsString()
  refreshToken: string;
}
