import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CreateRefundDto } from './dto/create-refund.dto.js';
import { UpdateRefundDto } from './dto/update-refund.dto.js';
import { RefundsService } from './refunds.service.js';
import { Roles } from '../../decorator/customize.js';
import { UserRole } from '../users/enums/user-role.enum.js';
import { RolesGuard } from '../../auth/passport/roles.guard.js';

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

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Req() req, @Param('id') id: string, @Body() dto: UpdateRefundDto) {
    return this.refundsService.update(id, req.user._id, dto);
  }
}
