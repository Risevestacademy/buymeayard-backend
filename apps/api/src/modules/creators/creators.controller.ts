import {
  Controller,
  Get,
  Put,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { CreatorsService } from './creators.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OnboardCreatorDto } from './dto/onboard-creator.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SaveCreatorMaterialsDto } from './dto/save-creator-materials.dto';
import { CreateCustomMaterialDto } from './dto/create-custom-material.dto';
import {
  CreatorProfileDataDto,
  CreatorMaterialResponseDto,
  AvatarUploadResponseDto,
  ApiErrorResponseDto,
} from './dto/creator-response.dto';
import { CheckSlugResponseDto } from './dto/check-slug.dto';
import { CreatorShareLinkResponseDto } from './dto/share-link.dto';
import { UpdateCreatorSettingsDto } from './dto/update-creator-settings.dto';
import { UpdatePageStatusDto } from './dto/update-page-status.dto';
import {
  CreatorDashboardResponseDto,
  DashboardBalanceDto,
  DashboardEarningsChartDto,
  DashboardEarningsQueryDto,
  DashboardContributionsQueryDto,
  DashboardContributionsListResponseDto,
} from './dto/creator-dashboard.dto';

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
    description: 'List of active creator profiles returned successfully.',
    type: [CreatorProfileDataDto],
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
    type: CreatorProfileDataDto,
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

  @Get('me/dashboard')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: 'Get creator overview dashboard',
    description:
      'Fetches the complete creator dashboard data including creator profile context, key summary metrics (contributions, contribution amount before charges, net earnings after charges), balance breakdown (available, pending, withdrawn to date), recent contributions with fabric swatches and supporter messages, and earnings over time chart data.',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['7d', '30d', '90d', '12m', 'all'],
    description: 'Time window for earnings chart metrics (default: 30d)',
    example: '30d',
  })
  @ApiResponse({
    status: 200,
    description: 'Creator dashboard overview returned successfully.',
    type: CreatorDashboardResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid session.',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ApiErrorResponseDto,
  })
  async getDashboard(
    @CurrentUser('id') userId: string,
    @Query('period') period?: '7d' | '30d' | '90d' | '12m' | 'all',
  ): Promise<CreatorDashboardResponseDto> {
    return this.creatorsService.getDashboardOverview(userId, period);
  }

  @Get('me/overview')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary:
      'Get creator overview dashboard (alias for /creators/me/dashboard)',
    description:
      'Alias for GET /creators/me/dashboard matching the Figma Overview sidebar nav item.',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['7d', '30d', '90d', '12m', 'all'],
    description: 'Time window for earnings chart metrics (default: 30d)',
    example: '30d',
  })
  @ApiResponse({
    status: 200,
    description: 'Creator dashboard overview returned successfully.',
    type: CreatorDashboardResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid session.',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ApiErrorResponseDto,
  })
  async getOverview(
    @CurrentUser('id') userId: string,
    @Query('period') period?: '7d' | '30d' | '90d' | '12m' | 'all',
  ): Promise<CreatorDashboardResponseDto> {
    return this.creatorsService.getDashboardOverview(userId, period);
  }

  @Get('me/dashboard/earnings')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: 'Get creator earnings over time chart data',
    description:
      'Returns timeline data points and aggregate totals (gross, platform fees, net) for the earnings over time bar/line chart.',
  })
  @ApiResponse({
    status: 200,
    description: 'Earnings chart data returned successfully.',
    type: DashboardEarningsChartDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid session.',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ApiErrorResponseDto,
  })
  async getDashboardEarnings(
    @CurrentUser('id') userId: string,
    @Query() query: DashboardEarningsQueryDto,
  ): Promise<DashboardEarningsChartDto> {
    return this.creatorsService.getDashboardEarnings(userId, query);
  }

  @Get('me/dashboard/contributions')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: 'Get paginated contributions list for creator dashboard',
    description:
      'Fetches paginated list of contributions received by the creator, including supporter details, fabric snapshots, and messages.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated contributions list returned successfully.',
    type: DashboardContributionsListResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid session.',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ApiErrorResponseDto,
  })
  async getDashboardContributions(
    @CurrentUser('id') userId: string,
    @Query() query: DashboardContributionsQueryDto,
  ): Promise<DashboardContributionsListResponseDto> {
    return this.creatorsService.getDashboardContributions(userId, query);
  }

  @Get('me/dashboard/balance')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: 'Get creator balance and payout eligibility overview',
    description:
      'Returns available balance from ledger, pending balance, withdrawn to date, KYC status, and withdrawal capability.',
  })
  @ApiResponse({
    status: 200,
    description: 'Creator balance overview returned successfully.',
    type: DashboardBalanceDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid session.',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ApiErrorResponseDto,
  })
  async getDashboardBalance(
    @CurrentUser('id') userId: string,
  ): Promise<DashboardBalanceDto> {
    return this.creatorsService.getDashboardBalance(userId);
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
    type: CreatorProfileDataDto,
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

  @Put('me/profile')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: 'Update creator profile',
    description:
      'Updates the creator display name and/or bio after initial onboarding. Bio is limited to 160 characters per design spec.',
  })
  @ApiBody({
    type: UpdateProfileDto,
    examples: {
      updateBio: {
        summary: 'Update bio only',
        value: {
          bio: 'I create honest lifestyle stories, practical guides and everyday inspiration.',
        },
      },
      updateBoth: {
        summary: 'Update name and bio',
        value: {
          creatorName: 'Fisayo Rotibi',
          bio: 'Digital artist based in Lagos.',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully.',
    type: CreatorProfileDataDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error (e.g. bio exceeds 160 characters).',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ApiErrorResponseDto,
  })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    const profile = await this.creatorsService.updateProfile(userId, dto);
    return this.creatorsService.formatCreatorProfile(profile);
  }

  @Post('me/avatar')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload creator avatar',
    description:
      'Uploads a profile image for the creator. Accepts JPEG, PNG, or WebP. Max file size: 5 MB.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Avatar uploaded successfully.',
    type: AvatarUploadResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid file type or file too large.',
    type: ApiErrorResponseDto,
  })
  async uploadAvatar(
    @CurrentUser('id') userId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5 MB
          new FileTypeValidator({
            fileType: /^image\/(jpeg|png|webp)$/,
            fallbackToMimetype: true,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.creatorsService.uploadAvatar(userId, file);
  }

  @Get('me/materials')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: 'Get creator material menu',
    description:
      'Returns the list of active materials the creator has configured with their custom pricing.',
  })
  @ApiResponse({
    status: 200,
    description: 'Creator materials returned successfully.',
    type: [CreatorMaterialResponseDto],
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ApiErrorResponseDto,
  })
  async getMyMaterials(@CurrentUser('id') userId: string) {
    return this.creatorsService.getCreatorMaterials(userId);
  }

  @Put('me/materials')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: 'Save creator material menu',
    description:
      "Sets the creator's yard menu. Provide the full list of materials with custom prices. Materials not included will be deactivated. Prices are in minor units (kobo).",
  })
  @ApiBody({
    type: SaveCreatorMaterialsDto,
    examples: {
      standard: {
        summary: 'Set two materials',
        value: {
          materials: [
            { materialId: 'uuid-ankara', price: 500000 },
            {
              materialId: 'uuid-lace',
              price: 1000000,
              displayName: 'Premium Lace',
            },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Material menu saved successfully.',
    type: [CreatorMaterialResponseDto],
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid material IDs or validation error.',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ApiErrorResponseDto,
  })
  async saveMyMaterials(
    @CurrentUser('id') userId: string,
    @Body() dto: SaveCreatorMaterialsDto,
  ) {
    return this.creatorsService.saveCreatorMaterials(userId, dto);
  }

  @Post('me/materials/custom')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: 'Add a custom material / appearance for the creator',
    description:
      'Creates a personal custom material belonging only to the authenticated creator and adds it to their active yard menu. Supports name, description, color swatch, and thumbnail images (small + large).',
  })
  @ApiBody({
    type: CreateCustomMaterialDto,
    examples: {
      minimal: {
        summary: 'Name only',
        value: { name: 'Silk Georgette' },
      },
      full: {
        summary: 'All fields',
        value: {
          name: 'Silk Georgette',
          description: 'Exclusive custom silk fabric for my supporters',
          color: '#C2185B',
          thumbnailSmallUrl:
            'https://res.cloudinary.com/buymeayard/image/upload/w_80,h_80,c_fill/materials/silk-sm.jpg',
          thumbnailLargeUrl:
            'https://res.cloudinary.com/buymeayard/image/upload/w_400,h_400,c_fill/materials/silk-lg.jpg',
          imageUrl:
            'https://res.cloudinary.com/demo/image/upload/custom-silk.jpg',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Custom material created successfully.',
    type: CreatorMaterialResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error — invalid URL, color, or missing name.',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ApiErrorResponseDto,
  })
  async createCustomMaterial(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCustomMaterialDto,
  ) {
    return this.creatorsService.createCustomMaterial(userId, dto);
  }

  @Patch('me/settings')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: 'Update creator page settings',
    description:
      'Unified endpoint to update Appearance settings (choose your theme material) and Supporter Interaction settings (personalized thank-you message + show supporter count toggle). All fields are optional — only provided fields are updated.',
  })
  @ApiBody({
    type: UpdateCreatorSettingsDto,
    examples: {
      themeOnly: {
        summary: 'Set appearance theme only',
        value: { themeMaterialId: 'c1a2b3d4-e5f6-7890-abcd-ef1234567890' },
      },
      supporterInteractions: {
        summary: 'Set thank-you message and toggle',
        value: {
          thankYouMessage: 'Thank you for the yard! 🙏',
          showSupportersOnPage: true,
        },
      },
      combined: {
        summary: 'All settings at once',
        value: {
          themeMaterialId: 'c1a2b3d4-e5f6-7890-abcd-ef1234567890',
          thankYouMessage: 'Thank you for the yard! 🙏',
          showSupportersOnPage: false,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Creator settings updated successfully.',
    type: CreatorProfileDataDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid themeMaterialId or validation error.',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid session token.',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ApiErrorResponseDto,
  })
  async updateCreatorSettings(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateCreatorSettingsDto,
  ) {
    const profile = await this.creatorsService.updateCreatorSettings(
      userId,
      dto,
    );
    return this.creatorsService.formatCreatorProfile(profile);
  }

  @Patch('me/page-status')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: 'Publish or unpublish creator support page',
    description:
      'Toggles public availability of the creator page. When publishing (isPublished = true), validates that all required setup fields (creatorName, slug, bio, avatar, thank-you message, and active materials) are fulfilled.',
  })
  @ApiBody({ type: UpdatePageStatusDto })
  @ApiResponse({
    status: 200,
    description: 'Creator page publish status updated successfully.',
    type: CreatorProfileDataDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Cannot publish profile — required setup fields are incomplete.',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid session token.',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ApiErrorResponseDto,
  })
  async updatePageStatus(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdatePageStatusDto,
  ) {
    const profile = await this.creatorsService.updatePageStatus(userId, dto);
    return this.creatorsService.formatCreatorProfile(profile);
  }

  @Get('me/share-link')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: 'Get creator share link & QR code metadata',
    description:
      'Returns public URL, scannable QR code, promotional sharing text, and direct social share links for Twitter, WhatsApp, Facebook, LinkedIn, and Telegram.',
  })
  @ApiResponse({
    status: 200,
    description: 'Share link metadata returned successfully.',
    type: CreatorShareLinkResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid session token.',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ApiErrorResponseDto,
  })
  async getMyShareLink(@CurrentUser('id') userId: string) {
    return this.creatorsService.getShareLink(userId);
  }

  @Public()
  @Get('check-slug')
  @ApiOperation({
    summary: 'Check slug availability in real time',
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
  @ApiResponse({
    status: 200,
    description: 'Slug availability status returned successfully.',
    type: CheckSlugResponseDto,
  })
  async checkSlug(
    @Query('slug') slug?: string,
    @CurrentUser('id') userId?: string,
  ): Promise<CheckSlugResponseDto> {
    const raw = slug || '';
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
    type: CreatorProfileDataDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator not found.',
    type: ApiErrorResponseDto,
  })
  async getCreatorBySlug(@Param('slug') slug: string) {
    const profile = await this.creatorsService.findBySlug(slug);
    return this.creatorsService.formatCreatorProfile(profile);
  }

  @Public()
  @Get(':slug/share-link')
  @ApiOperation({
    summary: 'Get public creator share link & QR code metadata by slug',
    description:
      'Public endpoint to fetch share metadata, QR code, and social links for a creator support page by slug handle.',
  })
  @ApiParam({
    name: 'slug',
    description: 'Creator slug handle (e.g. "adeola")',
    example: 'adeola',
  })
  @ApiResponse({
    status: 200,
    description: 'Share link metadata returned successfully.',
    type: CreatorShareLinkResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator not found.',
    type: ApiErrorResponseDto,
  })
  async getShareLinkBySlug(@Param('slug') slug: string) {
    return this.creatorsService.getShareLinkBySlug(slug);
  }
}
