import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CreateRefundDto } from './dto/create-refund.dto.js';
import { UpdateRefundDto } from './dto/update-refund.dto.js';
import { RefundsService } from './refunds.service.js';
import { Roles } from '../../decorator/customize.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { RolesGuard } from '../../auth/passport/roles.guard.js';

interface AuthenticatedRequest {
  user: { _id: string; role: UserRole };
}

@Controller('refunds')
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateRefundDto) {
    return this.refundsService.create(req.user._id, dto);
  }

  // Danh sách hoàn hàng của user hiện tại
  @Get()
  findAllForUser(
    @Req() req: AuthenticatedRequest,
    @Query() query: Record<string, any>,
    @Query('current') current: string,
    @Query('pageSize') pageSize: string,
  ) {
    return this.refundsService.findAllForUser(
      req.user._id,
      query,
      +current,
      +pageSize,
    );
  }

  // Toàn bộ yêu cầu hoàn hàng cho Admin (khai báo trước ':id')
  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  findAllForAdmin(
    @Query() query: Record<string, any>,
    @Query('current') current: string,
    @Query('pageSize') pageSize: string,
  ) {
    return this.refundsService.findAllForAdmin(query, +current, +pageSize);
  }

  @Get(':id')
  findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const isAdmin = req.user.role === UserRole.ADMIN;
    return this.refundsService.findOne(id, req.user._id, isAdmin);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateRefundDto) {
    return this.refundsService.update(id, dto);
  }
}
