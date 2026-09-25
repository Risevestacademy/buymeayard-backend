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

@ApiTags('creators')
@Controller('creators')
export class CreatorsController {
  constructor(private readonly creatorsService: CreatorsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Discover active creators',
    description:
      'Fetches a list of active creator profiles. Supports optional search filter by display name, username slug, or personalized link.',
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
      'Submits creator onboarding details including Creator Name, Personalized Link (e.g. buymeayard/adeola or adeola), and connected social media accounts. Assigns the CREATOR role upon completion.',
  })
  @ApiBody({
    type: OnboardCreatorDto,
    description: 'Creator onboarding request payload',
    examples: {
      standard: {
        summary: 'Standard Onboarding Example',
        value: {
          creatorName: 'Adeola Johnson',
          personalizedLink: 'buymeayard/adeola',
          socialLinks: [
            { platform: 'twitter', url: 'https://x.com/adeola' },
            { platform: 'instagram', url: 'https://instagram.com/adeola' },
          ],
        },
      },
      handleOnly: {
        summary: 'Using Slug Handle Directly',
        value: {
          creatorName: 'Adeola Johnson',
          personalizedLink: 'adeola',
          socialLinks: [
            { platform: 'tiktok', url: 'https://tiktok.com/@adeola' },
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
    description: 'Missing required fields or invalid personalized link format.',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid session token.',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict — personalized link or username is already taken.',
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
  @Get(':username')
  @ApiOperation({
    summary: 'Get public creator profile by username or personalized link',
    description:
      'Fetches public details and yard materials for a creator using their username slug or full personalized link identifier.',
  })
  @ApiParam({
    name: 'username',
    description:
      'Creator username slug or personalized link (e.g. "adeola" or "buymeayard/adeola")',
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
  async getCreatorByUsername(@Param('username') username: string) {
    const profile = await this.creatorsService.findByUsername(username);
    return this.creatorsService.formatCreatorProfile(profile);
  }
}
