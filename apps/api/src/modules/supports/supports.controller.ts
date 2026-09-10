import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupportsService } from './supports.service';
import { CreateSupportDto } from './dto/create-support.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('supports')
@ApiBearerAuth()
@Controller('supports')
export class SupportsController {
  constructor(private readonly supportsService: SupportsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new support transaction' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateSupportDto,
  ) {
    return this.supportsService.createSupport(userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get support details by ID' })
  async findById(@Param('id') id: string) {
    return this.supportsService.findById(id);
  }
}
