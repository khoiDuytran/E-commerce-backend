import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

// Trả nguyên body, không bọc qua TransformInterceptor (vd: callback của cổng thanh toán)
export const RAW_RESPONSE_KEY = 'rawResponse';
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);

export const RESPONSE_MESSAGE = 'response_message';
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE, message);
