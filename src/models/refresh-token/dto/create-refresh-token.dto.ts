import { IsNotEmpty } from 'class-validator';

export class CreateRefreshTokenDto {
  @IsNotEmpty({ message: 'userId không được để trống' })
  userId: string;
  @IsNotEmpty({ message: 'token không được để trống' })
  token: string;
  @IsNotEmpty({ message: 'expiresAt không được để trống' })
  expiresAt: Date;
}
