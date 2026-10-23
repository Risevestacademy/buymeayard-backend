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
import { AdminReasonDto } from '../dto/admin-query.dto';
import { AdminPayoutsService } from './admin-payouts.service';
import { AdminPayoutsQueryDto } from './admin-payouts.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/payouts')
export class AdminPayoutsController {
  constructor(private readonly payouts: AdminPayoutsService) {}

  @Get()
  @ApiOperation({
    summary: 'List payouts (status, creator, date range, search)',
  })
  list(@Query() query: AdminPayoutsQueryDto) {
    return this.payouts.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Payout detail with provider events and ledger entries',
  })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.payouts.get(id);
  }

  @Post(':id/reconcile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ask Paystack what happened to an in-flight payout and apply it',
  })
  reconcile(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.payouts.reconcile(id, adminId);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a stuck REQUESTED or PENDING payout to Paystack again',
    description:
      'Safe to repeat: the transfer reference is reused, so Paystack never sends twice.',
  })
  retry(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.payouts.retry(id, adminId);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a payout whose transfer never started',
    description:
      'Returns the reserved amount to the creator. Only for REQUESTED payouts Paystack has no record of.',
  })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminReasonDto,
  ) {
    return this.payouts.cancel(id, adminId, dto.reason);
  }
}
