import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MaterialsService } from './materials.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@buymeayard/types';
import { UpdateBasePriceDto } from './dto/update-base-price.dto';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';

@ApiTags('materials')
@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get platform materials catalogue' })
  @ApiQuery({
    name: 'all',
    required: false,
    type: Boolean,
    description: 'Whether to include inactive materials (default: false)',
  })
  async getMaterials(@Query('all') all?: string) {
    const includeAll = all === 'true' || all === '1';
    return this.materialsService.findAllCatalogue(includeAll);
  }

  @Public()
  @Get('base-price')
  @ApiOperation({
    summary: 'Get current universal base price per yard across all materials',
  })
  @ApiResponse({
    status: 200,
    description: 'Current universal base price details returned successfully.',
  })
  async getBasePrice() {
    return this.materialsService.getBasePrice();
  }

  @Public()
  @Get('calculate')
  @ApiOperation({
    summary:
      'Calculate yards from amount or amount from yards using universal base price',
  })
  @ApiQuery({
    name: 'amount',
    required: false,
    type: Number,
    description: 'Amount in major currency units (e.g. 50000 NGN)',
  })
  @ApiQuery({
    name: 'yards',
    required: false,
    type: Number,
    description: 'Number of yards to calculate cost for (e.g. 50)',
  })
  @ApiResponse({
    status: 200,
    description: 'Calculation result returned successfully.',
  })
  async calculate(
    @Query('amount') amount?: string,
    @Query('yards') yards?: string,
  ) {
    return this.materialsService.calculate(
      amount ? Number(amount) : undefined,
      yards ? Number(yards) : undefined,
    );
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a new platform material (Admin only)',
    description:
      'Creates a new fabric material with its own ID in the database and automatically applies the universal platform base price.',
  })
  @ApiResponse({
    status: 201,
    description: 'Material created successfully.',
  })
  async createMaterial(@Body() dto: CreateMaterialDto) {
    return this.materialsService.createMaterial(dto);
  }

  @Patch('base-price')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Update universal platform base price per yard (Admin only)',
    description:
      'Sets the single universal base price per yard for all platform materials (Ankara, Lace, Aso-Oke, Adire). Optionally syncs all existing creator materials.',
  })
  @ApiResponse({
    status: 200,
    description: 'Universal base price updated successfully.',
  })
  async updateBasePrice(@Body() dto: UpdateBasePriceDto) {
    return this.materialsService.updateBasePrice(dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Edit an existing material (Admin only)',
    description: 'Updates material name, description, imageUrl, slug, or status.',
  })
  @ApiParam({ name: 'id', description: 'Material ID' })
  @ApiResponse({
    status: 200,
    description: 'Material updated successfully.',
  })
  async updateMaterial(
    @Param('id') id: string,
    @Body() dto: UpdateMaterialDto,
  ) {
    return this.materialsService.updateMaterial(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Delete or deactivate a material (Admin only)',
    description:
      'Permanently removes material if no support items reference it, or deactivates it (soft-delete) to preserve historical transactions.',
  })
  @ApiParam({ name: 'id', description: 'Material ID' })
  @ApiResponse({
    status: 200,
    description: 'Material deleted or deactivated successfully.',
  })
  async deleteMaterial(@Param('id') id: string) {
    return this.materialsService.deleteMaterial(id);
  }

  @Public()
  @Get(':idOrSlug')
  @ApiOperation({ summary: 'Get catalogue material by ID or slug' })
  @ApiParam({
    name: 'idOrSlug',
    description: 'Material ID (UUID) or material slug (e.g. "ankara")',
  })
  async getMaterialByIdOrSlug(@Param('idOrSlug') idOrSlug: string) {
    return this.materialsService.findByIdOrSlug(idOrSlug);
  }
}
