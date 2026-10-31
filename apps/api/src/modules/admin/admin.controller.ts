import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@buymeayard/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditLog } from './decorators/audit-log.decorator';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import { AdminSummaryQueryDto } from './dashboard/admin-dashboard.dto';
import { WaitlistService } from '../waitlist/waitlist.service';
import { GetWaitlistQueryDto } from '../waitlist/dto/get-waitlist-query.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly dashboard: AdminDashboardService,
    private readonly waitlist: WaitlistService,
  ) {}

  @Get('summary')
  @AuditLog('admin.dashboard.view', 'AdminDashboard')
  @ApiOperation({
    summary:
      'Overview screen: KPIs, contribution volume, payout queue, recent creators',
    description:
      'One call for the whole Overview page. Money is in naira. `from`/`to` (Lagos days) drive the KPI cards and their change against the previous period of the same length; the weekly chart always ends this week.',
  })
  getSummary(
    @CurrentUser('id') adminId: string,
    @Query() query: AdminSummaryQueryDto,
  ) {
    return this.dashboard.getSummary(adminId, query);
  }

  @Get('waitlist')
  @ApiOperation({ summary: 'Waitlist entries with search' })
  listWaitlist(@Query() query: GetWaitlistQueryDto) {
    return this.waitlist.getWaitlist(query);
  }

  @Get('waitlist/export')
  @ApiOperation({ summary: 'Download the whole waitlist as CSV' })
  async exportWaitlist(@Res() res: Response) {
    // Sent raw: a CSV must not be wrapped in the JSON envelope
    res
      .type('text/csv; charset=utf-8')
      .attachment('waitlist.csv')
      .send(await this.waitlist.exportCsv());
  }
}
