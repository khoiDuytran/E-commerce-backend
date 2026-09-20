import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRefundDto {
  @IsString()
  @IsNotEmpty()
  orderCode: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;
}