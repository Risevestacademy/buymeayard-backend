import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { AdminCreatorsService } from './admin-creators.service';
import {
  AdminCreatorsQueryDto,
  AdminSetCreatorStatusDto,
} from './admin-creators.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/creators')
export class AdminCreatorsController {
  constructor(private readonly creators: AdminCreatorsService) {}

  @Get()
  @ApiOperation({ summary: 'List creators with lifetime contributions' })
  list(@Query() query: AdminCreatorsQueryDto) {
    return this.creators.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Creator detail: profile, KYC, balance, contribution and payout totals',
  })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.creators.get(id);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend, ban or reactivate a creator' })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminSetCreatorStatusDto,
  ) {
    return this.creators.setStatus(id, adminId, dto);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Take a creator page offline' })
  unpublish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminReasonDto,
  ) {
    return this.creators.unpublish(id, adminId, dto.reason);
  }
}
