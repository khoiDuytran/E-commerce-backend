import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { UpdateOrderDto } from './dto/update-order.dto.js';
import { Roles, ResponseMessage } from '../../decorator/customize.js';
import { UserRole } from '../users/enums/user-role.enum.js';
import { RolesGuard } from '../../auth/passport/roles.guard.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@Req() req, @Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.create(req.user._id, createOrderDto);
  }

  @Get()
  findAll(
    @Req() req,
    @Query() query: string,
    @Query('current') current: string,
    @Query('pageSize') pageSize: string,
  ) {
    return this.ordersService.findAll(req.user._id, query, +current, +pageSize);
  }

  @Get('code/:orderCode')
  findByOrderCode(@Req() req, @Param('orderCode') orderCode: string) {
    return this.ordersService.findByOrderCode(req.user._id, orderCode);
  }

  @Get(':id')
  findOne(@Req() req, @Param('id') id: string) {
    return this.ordersService.findOne(req.user._id, id);
  }

  @Patch()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Req() req, @Body() updateOrderDto: UpdateOrderDto) {
    return this.ordersService.update(req.user._id, updateOrderDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req) {
    return this.ordersService.remove(id, req.user._id);
  }
}
