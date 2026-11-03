import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { PaymentsController } from '../modules/payments/payments.controller.js';
import { TransformInterceptor } from './transform.interceptor.js';

const run = (handler: (...args: any[]) => any, body: object) =>
  firstValueFrom(
    new TransformInterceptor(new Reflector()).intercept(
      {
        getHandler: () => handler,
        switchToHttp: () => ({ getResponse: () => ({ statusCode: 200 }) }),
      } as any,
      { handle: () => of(body) } as any,
    ),
  );

describe('TransformInterceptor', () => {
  const body = { RspCode: '00', Message: 'Confirm Success' };

  it('returns the VNPay IPN body unwrapped', async () => {
    const handler = PaymentsController.prototype.vnpayIpn;
    expect(await run(handler, body)).toEqual(body);
  });

  it('wraps other responses', async () => {
    const handler = PaymentsController.prototype.vnpayReturn;
    expect(await run(handler, body)).toEqual({
      statusCode: 200,
      message: '',
      data: body,
    });
  });
});
