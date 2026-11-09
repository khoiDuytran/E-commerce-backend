import { IsString, Matches, MaxLength } from 'class-validator';

export class LookupCouponDto {
  @IsString({ message: 'Mã giảm giá không hợp lệ' })
  @MaxLength(50, { message: 'Mã giảm giá không hợp lệ' })
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Mã giảm giá không hợp lệ' })
  code: string;
}
