import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MaterialsService } from './materials.service';
import { Public } from '../../common/decorators/public.decorator';

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
  @Get(':slug')
  @ApiOperation({ summary: 'Get catalogue material by slug' })
  async getMaterialBySlug(@Param('slug') slug: string) {
    return this.materialsService.findCatalogueBySlug(slug);
  }
}
