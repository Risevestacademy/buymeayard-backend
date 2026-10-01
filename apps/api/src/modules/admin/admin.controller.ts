import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@buymeayard/types';
import { AuditLog } from './decorators/audit-log.decorator';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('summary')
  @AuditLog('admin.dashboard.view', 'AdminDashboard')
  @ApiOperation({ summary: 'Get administrative dashboard metrics' })
  async getSummary() {
    return this.adminService.getDashboardSummary();
  }

  @Get('audit-logs')
  @AuditLog('admin.audit_logs.view', 'AuditLog')
  @ApiOperation({ summary: 'Get system audit logs' })
  async getAuditLogs() {
    return this.adminService.getAuditLogs();
  }
}
