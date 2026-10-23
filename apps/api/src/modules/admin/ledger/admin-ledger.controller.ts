import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@buymeayard/types';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AdminLedgerService } from './admin-ledger.service';
import { AdminLedgerQueryDto } from './admin-ledger.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/ledger')
export class AdminLedgerController {
  constructor(private readonly ledger: AdminLedgerService) {}

  @Get()
  @ApiOperation({
    summary: 'List ledger entries (account, type, direction, dates)',
  })
  list(@Query() query: AdminLedgerQueryDto) {
    return this.ledger.list(query);
  }

  @Get('reconciliation')
  @ApiOperation({
    summary: 'Check the ledger against payments, payouts and refunds',
    description: 'healthy is true when every check is empty.',
  })
  reconciliation() {
    return this.ledger.reconciliation();
  }
}
