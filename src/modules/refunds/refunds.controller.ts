import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { CreateRefundDto } from './dto/create-refund.dto.js';
import { UpdateRefundDto } from './dto/update-refund.dto.js';
import { RefundsService } from './refunds.service.js';

@Controller('refunds')
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Post()
  create(@Req() req, @Body() dto: CreateRefundDto) {
    return this.refundsService.create(req.user._id, dto);
  }

  @Get(':id')
  findOne(@Req() req, @Param('id') id: string) {
    return this.refundsService.findOne(id, req.user._id);
  }

  // TODO: Khi có role admin, các transition APPROVED/RECEIVED/REFUNDED/REJECTED phải yêu cầu admin.
  @Patch(':id')
  update(@Req() req, @Param('id') id: string, @Body() dto: UpdateRefundDto) {
    return this.refundsService.update(id, req.user._id, dto);
  }
}