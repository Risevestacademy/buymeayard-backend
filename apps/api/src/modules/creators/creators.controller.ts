import { Controller, Get, Put, Body, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { CreatorsService } from './creators.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OnboardCreatorDto } from './dto/onboard-creator.dto';
import {
  CreatorResponseDto,
  CreatorListResponseDto,
  ApiErrorResponseDto,
} from './dto/creator-response.dto';
import { CheckSlugResponseDto } from './dto/check-slug.dto';

@ApiTags('creators')
@Controller('creators')
export class CreatorsController {
  constructor(private readonly creatorsService: CreatorsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Discover active creators',
    description:
      'Fetches a list of active creator profiles. Supports optional search filter by creator name or slug.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Filter creators by name or handle',
    example: 'adeola',
  })
  @ApiResponse({
    status: 200,
    description: 'Creators returned successfully.',
    type: CreatorListResponseDto,
  })
  async getCreators(@Query() query: any) {
    return this.creatorsService.findAll(query);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: 'Get current logged-in creator profile',
    description:
      'Retrieves the creator profile for the currently authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Creator profile returned successfully.',
    type: CreatorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid session.',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found for user.',
    type: ApiErrorResponseDto,
  })
  async getMyProfile(@CurrentUser('id') userId: string) {
    const profile = await this.creatorsService.findByUserId(userId);
    return this.creatorsService.formatCreatorProfile(profile);
  }

  @Put('me/onboarding')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: 'Complete creator profile onboarding',
    description:
      'Submits creator onboarding details including Creator Name, Slug handle (e.g. "adeola"), and connected social media accounts. Assigns the CREATOR role upon completion.',
  })
  @ApiBody({
    type: OnboardCreatorDto,
    description: 'Creator onboarding request payload',
    examples: {
      standard: {
        summary: 'Standard Onboarding Example',
        value: {
          creatorName: 'Adeola Johnson',
          slug: 'adeola',
          socialLinks: [
            { platform: 'twitter', url: 'https://x.com/adeola' },
            { platform: 'instagram', url: 'https://instagram.com/adeola' },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Creator profile onboarded successfully.',
    type: CreatorResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Missing required fields or invalid slug format.',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid session token.',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict — slug is already taken.',
    type: ApiErrorResponseDto,
  })
  async onboardCreator(
    @CurrentUser('id') userId: string,
    @Body() dto: OnboardCreatorDto,
  ) {
    const profile = await this.creatorsService.onboardCreator(userId, dto);
    return this.creatorsService.formatCreatorProfile(profile);
  }

  @Public()
  @Get('check-slug')
  @ApiOperation({
    summary: 'Check username / slug availability in real time',
    description:
      'Validates syntax, reserved words, and checks uniqueness for creator handle during onboarding.',
  })
  @ApiQuery({
    name: 'slug',
    required: false,
    type: String,
    description:
      'Creator slug or handle to check (e.g. "aesthetefisayo" or "@aesthetefisayo")',
    example: 'aesthetefisayo',
  })
  @ApiQuery({
    name: 'username',
    required: false,
    type: String,
    description: 'Alias for slug query parameter',
    example: 'aesthetefisayo',
  })
  @ApiResponse({
    status: 200,
    description: 'Slug availability status returned successfully.',
    type: CheckSlugResponseDto,
  })
  async checkSlug(
    @Query('slug') slug?: string,
    @Query('username') username?: string,
    @CurrentUser('id') userId?: string,
  ): Promise<CheckSlugResponseDto> {
    const raw = slug || username || '';
    return this.creatorsService.checkSlugAvailability(raw, userId);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({
    summary: 'Get public creator profile by slug',
    description:
      'Fetches public details and yard materials for a creator using their unique slug handle (e.g. "adeola").',
  })
  @ApiParam({
    name: 'slug',
    description: 'Creator slug handle (e.g. "adeola")',
    example: 'adeola',
  })
  @ApiResponse({
    status: 200,
    description: 'Public creator profile returned successfully.',
    type: CreatorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator not found.',
    type: ApiErrorResponseDto,
  })
  async getCreatorBySlug(@Param('slug') slug: string) {
    const profile = await this.creatorsService.findByUsername(slug);
    return this.creatorsService.formatCreatorProfile(profile);
  }
}
