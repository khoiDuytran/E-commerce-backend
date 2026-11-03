import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNotEmptyObject,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class PushSubscriptionKeysDto {
  @IsString({ message: 'p256dh phải là chuỗi' })
  @IsNotEmpty({ message: 'p256dh không được để trống' })
  @MaxLength(200)
  p256dh: string;

  @IsString({ message: 'auth phải là chuỗi' })
  @IsNotEmpty({ message: 'auth không được để trống' })
  @MaxLength(100)
  auth: string;
}

/** Dữ liệu từ PushSubscription.toJSON() của trình duyệt */
export class SubscribePushDto {
  @IsUrl(
    { protocols: ['https'], require_protocol: true, require_tld: false },
    { message: 'endpoint phải là URL https' },
  )
  @MaxLength(1000)
  endpoint: string;

  @IsNotEmptyObject({}, { message: 'keys không được để trống' })
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys: PushSubscriptionKeysDto;
}

export class UnsubscribePushDto {
  @IsUrl(
    { protocols: ['https'], require_protocol: true, require_tld: false },
    { message: 'endpoint phải là URL https' },
  )
  @MaxLength(1000)
  endpoint: string;
}
