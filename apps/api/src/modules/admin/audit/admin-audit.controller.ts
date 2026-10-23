import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@buymeayard/types';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuditLogsQueryDto } from './admin-audit.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/audit-logs')
export class AdminAuditController {
  constructor(private readonly audit: AdminAuditService) {}

  @Get()
  @ApiOperation({
    summary: 'Audit log with actor, action, resource and date filters',
  })
  list(@Query() query: AdminAuditLogsQueryDto) {
    return this.audit.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One audit entry with previous and new state' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.audit.get(id);
  }
}
