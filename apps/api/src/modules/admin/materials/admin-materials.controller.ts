import {
  Body,
  Controller,
  Delete,
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
import { AdminMaterialsService } from './admin-materials.service';
import {
  AdminCreateMaterialDto,
  AdminMaterialsQueryDto,
  AdminUpdateMaterialDto,
} from './admin-materials.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/materials')
export class AdminMaterialsController {
  constructor(private readonly materials: AdminMaterialsService) {}

  @Get()
  @ApiOperation({
    summary:
      'List all materials (platform and creator) with totals, creator-page visibility and last updated',
  })
  list(@Query() query: AdminMaterialsQueryDto) {
    return this.materials.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Material detail with every creator using it',
  })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.materials.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a platform or creator material' })
  create(
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminCreateMaterialDto,
  ) {
    return this.materials.create(adminId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a material (any field, incl. price/status)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminUpdateMaterialDto,
  ) {
    return this.materials.update(id, adminId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a material, or deactivate it if it has support history',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.materials.remove(id, adminId);
  }
}
