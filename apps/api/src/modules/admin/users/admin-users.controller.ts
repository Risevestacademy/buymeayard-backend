import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { AdminUsersService } from './admin-users.service';
import { AdminSetUserStatusDto, AdminUsersQueryDto } from './admin-users.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users (search, status and role filters)' })
  list(@Query() query: AdminUsersQueryDto) {
    return this.users.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'User detail with roles, sessions and admin history',
  })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(id);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Suspend, ban or reactivate a user',
    description:
      'Suspending or banning signs the user out everywhere and unpublishes their creator page. Admins cannot be changed from here.',
  })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminSetUserStatusDto,
  ) {
    return this.users.setStatus(id, adminId, dto);
  }
}
