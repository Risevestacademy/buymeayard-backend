import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupportersService } from './supporters.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('supporters')
@ApiBearerAuth()
@Controller('supporters')
export class SupportersController {
  constructor(private readonly supportersService: SupportersService) {}

  @Get('me/supports')
  @ApiOperation({ summary: 'Get current supporter support history' })
  async getMySupports(@CurrentUser('id') supporterId: string) {
    return this.supportersService.getSupportHistory(supporterId);
  }
}
