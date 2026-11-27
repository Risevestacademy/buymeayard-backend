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
import { AdminTicketsService } from './admin-tickets.service';
import {
  AdminTicketsQueryDto,
  AdminUpdateTicketDto,
} from './admin-tickets.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/support-tickets')
export class AdminTicketsController {
  constructor(private readonly tickets: AdminTicketsService) {}

  @Get()
  @ApiOperation({ summary: 'List support tickets' })
  list(@Query() query: AdminTicketsQueryDto) {
    return this.tickets.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Ticket detail with the payout or contribution it is about',
  })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.tickets.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Resolve or reopen a ticket' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminUpdateTicketDto,
  ) {
    return this.tickets.update(id, adminId, dto);
  }
}
