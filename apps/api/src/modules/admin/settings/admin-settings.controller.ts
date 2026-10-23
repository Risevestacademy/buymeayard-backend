import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@buymeayard/types';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AdminSettingsService } from './admin-settings.service';
import { AdminUpdateSettingsDto } from './admin-settings.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settings: AdminSettingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Platform fee and withdrawal rules (with built-in defaults)',
  })
  get() {
    return this.settings.get();
  }

  @Patch()
  @ApiOperation({
    summary: 'Update the platform fee and withdrawal rules',
    description:
      'Send only the fields to change. Applies to new contributions and withdrawals; existing ones keep their fee. Money is in kobo.',
  })
  update(
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminUpdateSettingsDto,
  ) {
    return this.settings.update(adminId, dto);
  }
}
