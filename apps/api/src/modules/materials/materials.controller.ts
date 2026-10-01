import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
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

@ApiTags('materials')
@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get platform materials catalogue' })
  async getMaterials() {
    return this.materialsService.findAllCatalogue();
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

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get catalogue material by slug' })
  async getMaterialBySlug(@Param('slug') slug: string) {
    return this.materialsService.findCatalogueBySlug(slug);
  }
}
