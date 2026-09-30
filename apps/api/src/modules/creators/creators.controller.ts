import { Controller, Get, Put, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CreatorsService } from './creators.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OnboardCreatorDto } from './dto/onboard-creator.dto';

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
    const profile = await this.creatorsService.findByUserId(userId);
    return this.creatorsService.formatCreatorProfile(profile);
  }

  @Put('me/onboarding')
  @ApiOperation({ summary: 'Complete creator profile onboarding' })
  async onboardCreator(
    @CurrentUser('id') userId: string,
    @Body() dto: OnboardCreatorDto,
  ) {
    const profile = await this.creatorsService.onboardCreator(userId, dto);
    return this.creatorsService.formatCreatorProfile(profile);
  }

  @Public()
  @Get(':username')
  @ApiOperation({ summary: 'Get public creator profile by username' })
  async getCreatorByUsername(@Param('username') username: string) {
    const profile = await this.creatorsService.findByUsername(username);
    return this.creatorsService.formatCreatorProfile(profile);
  }
}
