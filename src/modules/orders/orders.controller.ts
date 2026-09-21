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
} from '@nestjs/common';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { OrdersService } from './orders.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { UpdateOrderDto } from './dto/update-order.dto.js';

interface AuthenticatedRequest {
  user: { _id: string; role: UserRole };
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body() createOrderDto: CreateOrderDto,
  ) {
    return this.ordersService.create(req.user._id, createOrderDto);
  }

  // Đơn hàng của chính user
  @Get()
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query() query: Record<string, any>,
    @Query('current') current: string,
    @Query('pageSize') pageSize: string,
  ) {
    return this.ordersService.findAll(req.user._id, query, +current, +pageSize);
  }

  // Toàn bộ đơn hàng (admin) — khai báo trước ':id'
  @Get('admin/all')
  findAllForAdmin(
    @Req() req: AuthenticatedRequest,
    @Query() query: Record<string, any>,
    @Query('current') current: string,
    @Query('pageSize') pageSize: string,
  ) {
    return this.ordersService.findAllForAdmin(
      req.user.role,
      query,
      +current,
      +pageSize,
    );
  }

  // Phải khai báo trước ':id' để 'code' không bị bắt nhầm thành id
  @Get('code/:orderCode')
  findByOrderCode(
    @Req() req: AuthenticatedRequest,
    @Param('orderCode') orderCode: string,
  ) {
    return this.ordersService.findByOrderCode(
      req.user._id,
      req.user.role,
      orderCode,
    );
  }

  @Get(':id')
  findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.ordersService.findOne(req.user._id, req.user.role, id);
  }

  @Patch()
  update(
    @Req() req: AuthenticatedRequest,
    @Body() updateOrderDto: UpdateOrderDto,
  ) {
    return this.ordersService.update(
      req.user._id,
      req.user.role,
      updateOrderDto,
    );
  }

  // Huỷ đơn: hoàn kho + coupon
  @Patch('cancel/:id')
  cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.ordersService.cancel(req.user._id, req.user.role, id);
  }

  // Xoá cứng đơn đã huỷ — chỉ admin
  @Delete(':id')
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.ordersService.remove(req.user.role, id);
  }
}
