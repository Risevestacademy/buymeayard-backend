import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@buymeayard/types';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AdminSupportsService } from './admin-supports.service';
import {
  AdminRefundDto,
  AdminRefundsQueryDto,
  AdminSupportsQueryDto,
} from './admin-supports.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminSupportsController {
  constructor(private readonly supports: AdminSupportsService) {}

  @Get('supports')
  @ApiOperation({
    summary: 'List contributions (status, creator, date range, search)',
  })
  list(@Query() query: AdminSupportsQueryDto) {
    return this.supports.list(query);
  }

  @Get('supports/:id')
  @ApiOperation({
    summary: 'Contribution detail with payment, refunds and ledger entries',
  })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.supports.get(id);
  }

  @Post('supports/:id/refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refund a paid contribution in full through Paystack',
    description:
      'Takes the money back from the creator and the platform fee first, then asks Paystack to refund the supporter. PROCESSING means Paystack is still working; the refund.processed webhook finishes it. A rejected refund is rolled back.',
  })
  refund(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminRefundDto,
  ) {
    return this.supports.refund(id, adminId, dto);
  }

  @Get('refunds')
  @ApiOperation({ summary: 'List refunds' })
  listRefunds(@Query() query: AdminRefundsQueryDto) {
    return this.supports.listRefunds(query);
  }
}
