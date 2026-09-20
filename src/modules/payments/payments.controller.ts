import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Public } from '../../decorator/customize.js';
import { PaymentsService } from './payments.service.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  create(@Req() req, @Body() createPaymentDto: CreatePaymentDto) {
    return this.paymentsService.create(req.user._id, createPaymentDto);
  }

  @Get('order/:orderId')
  findByOrder(@Req() req, @Param('orderId') orderId: string) {
    return this.paymentsService.findByOrder(orderId, req.user._id);
  }

  @Get(':id')
  findOne(@Req() req, @Param('id') id: string) {
    return this.paymentsService.findOne(id, req.user._id);
  }

  @Post(':id/retry')
  retry(@Req() req, @Param('id') id: string) {
    return this.paymentsService.retry(id, req.user._id);
  }

  @Public()
  @Get('vnpay/ipn')
  vnpayIpn(@Query() query: Record<string, string>) {
    return this.paymentsService.handleVnpayIpn(query);
  }

  @Public()
  @Get('vnpay/return')
  vnpayReturn(@Query() query: Record<string, string>) {
    return this.paymentsService.handleVnpayReturn(query);
  }
}
