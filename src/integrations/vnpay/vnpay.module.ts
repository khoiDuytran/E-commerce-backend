import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VnpayService } from './vnpay.service.js';

@Module({
  imports: [ConfigModule],
  providers: [VnpayService],
  exports: [VnpayService],
})
export class VnpayModule {}