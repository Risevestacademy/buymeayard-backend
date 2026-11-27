import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@buymeayard/types';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AdminReportsService } from './admin-reports.service';
import {
  AdminReportsQueryDto,
  AdminUpdateReportDto,
} from './admin-reports.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  @Get()
  @ApiOperation({ summary: 'List content reports' })
  list(@Query() query: AdminReportsQueryDto) {
    return this.reports.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Report detail with the reported post' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.reports.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Move a report to review, resolve it or reject it' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminUpdateReportDto,
  ) {
    return this.reports.update(id, adminId, dto);
  }
}
