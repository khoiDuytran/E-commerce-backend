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
import { CreateProductVariantDto } from './dto/create-product-variant.dto.js';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto.js';
import { ProductVariantsService } from './product-variants.service.js';
import { Public, Roles } from '../../decorator/customize.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { RolesGuard } from '../../auth/passport/roles.guard.js';

@Controller('product-variants')
export class ProductVariantsController {
  constructor(
    private readonly productVariantsService: ProductVariantsService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateProductVariantDto) {
    return this.productVariantsService.create(dto);
  }

  @Public()
  @Get()
  findAll(
    @Query() query: string,
    @Query('current') current: string,
    @Query('pageSize') pageSize: string,
  ) {
    return this.productVariantsService.findAll(query, +current, +pageSize);
  }

  /** Như danh sách public nhưng kèm giá nhập, chỉ admin */
  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  findAllForAdmin(
    @Query() query: string,
    @Query('current') current: string,
    @Query('pageSize') pageSize: string,
  ) {
    return this.productVariantsService.findAll(
      query,
      +current,
      +pageSize,
      true,
    );
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productVariantsService.findOne(id);
  }

  @Patch()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Body() dto: UpdateProductVariantDto) {
    return this.productVariantsService.update(dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.productVariantsService.remove(id);
  }
}
