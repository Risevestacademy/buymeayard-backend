import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CreatorsService } from './creators.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('creators')
@Controller('creators')
export class CreatorsController {
  constructor(private readonly creatorsService: CreatorsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Discover creators' })
  async getCreators(@Query() query: any) {
    return this.creatorsService.findAll(query);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current logged-in creator profile' })
  async getMyProfile(@CurrentUser('id') userId: string) {
    return this.creatorsService.findByUserId(userId);
  }

  @Public()
  @Get(':username')
  @ApiOperation({ summary: 'Get public creator profile by username' })
  async getCreatorByUsername(@Param('username') username: string) {
    return this.creatorsService.findByUsername(username);
  }
}
