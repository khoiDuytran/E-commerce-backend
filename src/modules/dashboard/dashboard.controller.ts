import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service.js';
import { Roles } from '../../decorator/customize.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { RolesGuard } from '../../auth/passport/roles.guard.js';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  getStats() {
    return this.dashboardService.getStats();
  }
}

