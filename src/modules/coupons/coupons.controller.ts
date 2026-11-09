import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CouponService } from './coupons.service.js';
import { CreateCouponDto } from './dto/create-coupon.dto.js';
import { UpdateCouponDto } from './dto/update-coupon.dto.js';
import { LookupCouponDto } from './dto/lookup-coupon.dto.js';
import { Roles } from '../../decorator/customize.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { RolesGuard } from '../../auth/passport/roles.guard.js';

@Controller('coupon')
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() createCouponDto: CreateCouponDto) {
    return this.couponService.create(createCouponDto);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll(
    @Query() query: string,
    @Query('current') current: string,
    @Query('pageSize') pageSize: string,
  ) {
    return this.couponService.findAll(query, +current, +pageSize);
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  getStats() {
    return this.couponService.getStats();
  }

  // Khách tra một mã khi thanh toán; chỉ trả mã còn dùng được và các field để tính tiền giảm
  @Get('lookup')
  lookup(@Query() { code }: LookupCouponDto) {
    return this.couponService.lookup(code);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  findOne(@Param('id') id: string) {
    return this.couponService.findOne(id);
  }

  @Patch()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Body() updateCouponDto: UpdateCouponDto) {
    return this.couponService.update(updateCouponDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.couponService.remove(id);
  }
}
