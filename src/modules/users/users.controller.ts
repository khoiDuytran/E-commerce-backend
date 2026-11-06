import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import {
  UpdateUserDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from './dto/update-user.dto.js';
import { DisableAccountDto } from './dto/account-status.dto.js';
import { EmailAuthDto } from '../../auth/dto/email-auth.dto.js';
import { Roles } from '../../decorator/customize.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { RolesGuard } from '../../auth/passport/roles.guard.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@Req() req: any) {
    return {
      user: await this.usersService.findProfile(req.user._id),
    };
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  getStats() {
    return this.usersService.getStats();
  }

  @Get('admin-only')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  adminOnly() {
    return {
      message: 'Chỉ admin mới truy cập được.',
    };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async findAll(
    @Query() query: string,
    @Query('current') current: string,
    @Query('pageSize') pageSize: string,
  ) {
    return this.usersService.findAll(query, +current, +pageSize);
  }

  @Post('me/disable/code')
  requestDisableCode(@Req() req: any, @Body() { email }: EmailAuthDto) {
    return this.usersService.requestDisableCode(req.user._id, email);
  }

  @Patch('me/disable')
  disableMe(@Req() req: any, @Body() { code }: DisableAccountDto) {
    return this.usersService.disableSelf(req.user._id, code);
  }

  @Patch('status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  updateStatus(@Req() req: any, @Body() dto: UpdateUserStatusDto) {
    return this.usersService.updateStatus(dto, req.user._id);
  }

  @Patch('role')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  updateRole(@Req() req: any, @Body() dto: UpdateUserRoleDto) {
    return this.usersService.updateRole(dto, req.user._id);
  }

  @Patch()
  update(@Req() req: any, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(
      updateUserDto,
      req.user._id,
      req.user.role === UserRole.ADMIN,
    );
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Req() req: any, @Param('id') _id: string) {
    return this.usersService.remove(_id, req.user._id);
  }
}
