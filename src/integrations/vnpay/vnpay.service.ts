import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface VnpayPaymentInfo {
  checkoutUrl: string;
  orderCode: string;
  amount: number;
}

@Injectable()
export class VnpayService {
  constructor(private readonly configService: ConfigService) {}

  getPaymentInfo(orderCode: string, amount: number): VnpayPaymentInfo {
    const params = this.buildPaymentParams(orderCode, amount);
    const query = this.buildQuery(params); // đã encode, sort
    const secureHash = this.sign(query); // ký đúng chuỗi này
    return {
      checkoutUrl: `${this.getPaymentUrl()}?${query}&vnp_SecureHash=${secureHash}`,
      orderCode,
      amount,
    };
  }

  verifyResponse(query: Record<string, string>): boolean {
    const receivedHash = query.vnp_SecureHash;
    if (!receivedHash) return false;

    const signingQuery = this.buildQuery(
      Object.fromEntries(
        Object.entries(query).filter(
          ([key]) => key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType',
        ),
      ),
    );
    const expected = Buffer.from(this.sign(signingQuery), 'utf8');
    const received = Buffer.from(receivedHash.toLowerCase(), 'utf8');
    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  }

  private buildPaymentParams(orderCode: string, amount: number) {
    const now = this.formatDate(new Date());
    return {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: this.requiredConfig('VNPAY_TMN_CODE'),
      vnp_Amount: String(Math.round(amount * 100)),
      vnp_CreateDate: now,
      vnp_CurrCode: 'VND',
      vnp_IpAddr: this.configService.get<string>('VNPAY_IP_ADDR', '127.0.0.1'),
      vnp_Locale: 'vn',
      vnp_OrderInfo: `Thanh toan don hang ${orderCode}`,
      vnp_OrderType: 'other',
      vnp_ReturnUrl: this.requiredConfig('VNPAY_RETURN_URL'),
      vnp_TxnRef: orderCode,
    };
  }

  private buildQuery(params: Record<string, string>): string {
    return Object.keys(params)
      .sort()
      .map((key) => `${this.encode(key)}=${this.encode(params[key])}`)
      .join('&');
  }

  private encode(value: string): string {
    return encodeURIComponent(value).replace(/%20/g, '+');
  }

  private sign(query: string): string {
    return createHmac('sha512', this.requiredConfig('VNPAY_HASH_SECRET'))
      .update(query, 'utf8')
      .digest('hex');
  }

  private getPaymentUrl(): string {
    return this.configService.get<string>(
      'VNPAY_PAYMENT_URL',
      'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    );
  }

  private requiredConfig(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) throw new Error(`${key} chưa được cấu hình`);
    return value;
  }

  private formatDate(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)!.value;
    return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}${get('second')}`;
  }
}
