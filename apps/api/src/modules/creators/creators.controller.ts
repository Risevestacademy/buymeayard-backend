import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import {
  ApiErrors,
  CREATOR_NOT_FOUND_ERROR,
  UNAUTHORIZED_ERROR,
  VALIDATION_ERROR,
  ApiErrorDoc,
} from '../../common/decorators/api-errors.decorator';
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
} from './dto/creator-response.dto';
import { CheckSlugResponseDto } from './dto/check-slug.dto';
import { CreatorShareLinkResponseDto } from './dto/share-link.dto';
import { UpdateCreatorSettingsDto } from './dto/update-creator-settings.dto';
import { UpdatePageStatusDto } from './dto/update-page-status.dto';
import {
  CreateSupportIntentDto,
  SupportQuoteQueryDto,
} from './dto/create-support-intent.dto';
import { SupportsService } from '../supports/supports.service';
import { DiscoverCreatorsQueryDto } from './dto/discover-creators-query.dto';
import { DiscoverCreatorsResponseDto } from './dto/discover-creators-response.dto';
import { PaymentsService } from '../payments/payments.service';
import { resolveCallbackUrl } from '../payments/utils/callback-url.util';
import {
  SupportWallQueryDto,
  SupportWallResponseDto,
} from '../supports/dto/support-wall.dto';
import {
  CheckoutGiftDto,
  CheckoutGiftResponseDto,
  SupportIntentResponseDto,
  SupportQuoteResponseDto,
} from '../supports/dto/guest-support.dto';
import { UpdateThankYouMessageDto } from './dto/update-thank-you-message.dto';
import {
  CreatorDashboardResponseDto,
  DashboardBalanceDto,
  DashboardEarningsChartDto,
  DashboardEarningsQueryDto,
  DashboardContributionsQueryDto,
  DashboardContributionsListResponseDto,
  DashboardMetricsDto,
  DashboardContributionDto,
  DashboardRecentContributionsQueryDto,
} from './dto/creator-dashboard.dto';

const CREATOR_UNAVAILABLE_ERRORS: ApiErrorDoc[] = [
  {
    status: 404,
    code: 'CREATOR_NOT_FOUND',
    message: 'Creator not found',
    when: 'No creator has this slug, or their page is not published.',
  },
  {
    status: 403,
    code: 'CREATOR_NOT_ACTIVE',
    message: 'This creator is not accepting contributions yet',
    when: 'The creator has not finished verification, so gifts are closed.',
  },
];

const NO_MATERIAL_ERROR: ApiErrorDoc = {
  status: 400,
  code: 'MATERIAL_NOT_FOUND',
  message: 'This creator has no active materials available for support',
  when: 'The creator has no active, priced fabric to count the gift in.',
};

@ApiTags('creators')
@Controller('creators')
export class CreatorsController {
  constructor(
    private readonly creatorsService: CreatorsService,
    private readonly supportsService: SupportsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Discover active creators',
    description:
      'Fetches a page of active creator profiles, newest first. Supports optional search filter by creator name or slug. Page with `page` + `limit`.',
  })
  @ApiResponse({
    status: 200,
    description: 'A page of active creator profiles: `{ items, pagination }`.',
    type: DiscoverCreatorsResponseDto,
  })
  async getCreators(@Query() query: DiscoverCreatorsQueryDto) {
    return this.creatorsService.findAll(query);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: 'Get current logged-in creator profile',
    description:
      'Retrieves the creator profile for the currently authenticated user. Includes `isKycCompleted` (identity verified) and `isBankAccountConnected` (a verified payout bank account is saved). `isBankAccountConnected` is only returned here, never on public profiles.',
  })
  @ApiResponse({
    status: 200,
    description: 'Creator profile returned successfully.',
    type: CreatorProfileDataDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid session.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found for user.',
    type: ErrorResponseDto,
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
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ErrorResponseDto,
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
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ErrorResponseDto,
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
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ErrorResponseDto,
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
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ErrorResponseDto,
  })
  async getDashboardContributions(
    @CurrentUser('id') userId: string,
    @Query() query: DashboardContributionsQueryDto,
  ): Promise<DashboardContributionsListResponseDto> {
    return this.creatorsService.getDashboardContributions(userId, query);
  }

  @Get('me/dashboard/contributions/:id')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: 'Get one contribution for the details panel',
    description:
      'Amount, platform fee, net amount, message, status and payment reference. Only contributions received by the signed-in creator can be read.',
  })
  @ApiParam({ name: 'id', description: 'Contribution id from the list' })
  @ApiResponse({ status: 200, type: DashboardContributionDto })
  @ApiErrors(UNAUTHORIZED_ERROR, CREATOR_NOT_FOUND_ERROR, {
    status: 404,
    code: 'NOT_FOUND',
    message: 'Contribution not found',
    when: 'The id does not exist, is unpaid, or belongs to another creator.',
  })
  async getDashboardContribution(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<DashboardContributionDto> {
    return this.creatorsService.getDashboardContribution(userId, id);
  }

  @Get('me/dashboard/metrics')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: 'Get creator summary KPI metrics',
    description:
      'Returns key metrics (total contributions count, gross contribution amount before charges, net creator earnings after charges, platform fees).',
  })
  @ApiResponse({
    status: 200,
    description: 'Creator dashboard metrics returned successfully.',
    type: DashboardMetricsDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid session.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ErrorResponseDto,
  })
  async getDashboardMetrics(
    @CurrentUser('id') userId: string,
  ): Promise<DashboardMetricsDto> {
    return this.creatorsService.getDashboardMetrics(userId);
  }

  @Get('me/metrics')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary:
      'Get creator summary KPI metrics (alias for /creators/me/dashboard/metrics)',
    description: 'Alias for GET /creators/me/dashboard/metrics.',
  })
  @ApiResponse({
    status: 200,
    description: 'Creator dashboard metrics returned successfully.',
    type: DashboardMetricsDto,
  })
  async getMetricsAlias(
    @CurrentUser('id') userId: string,
  ): Promise<DashboardMetricsDto> {
    return this.creatorsService.getDashboardMetrics(userId);
  }

  @Get('me/dashboard/recent-contributions')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: 'Get recent contributions list for creator dashboard card',
    description:
      'Fetches latest gifts received by the creator (default 5, max 20) with supporter details and fabric swatches.',
  })
  @ApiResponse({
    status: 200,
    description: 'Recent contributions returned successfully.',
    type: [DashboardContributionDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid session.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ErrorResponseDto,
  })
  async getDashboardRecentContributions(
    @CurrentUser('id') userId: string,
    @Query() query: DashboardRecentContributionsQueryDto,
  ): Promise<DashboardContributionDto[]> {
    return this.creatorsService.getDashboardRecentContributions(
      userId,
      query?.limit,
    );
  }

  @Get('me/recent-contributions')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary:
      'Get recent contributions (alias for /creators/me/dashboard/recent-contributions)',
    description:
      'Alias for GET /creators/me/dashboard/recent-contributions matching CREATOR_DASHBOARD_OVERVIEW_ENDPOINTS.md spec.',
  })
  @ApiResponse({
    status: 200,
    description: 'Recent contributions returned successfully.',
    type: [DashboardContributionDto],
  })
  async getRecentContributionsAlias(
    @CurrentUser('id') userId: string,
    @Query() query: DashboardRecentContributionsQueryDto,
  ): Promise<DashboardContributionDto[]> {
    return this.creatorsService.getDashboardRecentContributions(
      userId,
      query?.limit,
    );
  }

  @Get('me/dashboard/balance')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: 'Get creator balance and payout eligibility overview',
    description:
      'Same response as GET /creators/me/balance. See that endpoint for how each field maps to the Payouts screens.',
  })
  @ApiResponse({
    status: 200,
    description: 'Creator balance overview returned successfully.',
    type: DashboardBalanceDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid session.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ErrorResponseDto,
  })
  async getDashboardBalance(
    @CurrentUser('id') userId: string,
  ): Promise<DashboardBalanceDto> {
    return this.creatorsService.getDashboardBalance(userId);
  }

  @Get('me/balance')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: 'Payouts overview: setup steps, balances and payout account',
    description: `Everything the top of the **Payouts** page needs (web 1486:8708 … / mobile 01–06).

**Setup card ("A little setup. Then, you’re ready.")**: \`setupStep\`:
- \`VERIFY_IDENTITY\` → "Verify your identity" step, **Verify identity** button.
- \`CONNECT_BANK\` → "Where should your money land?", **Add bank account** button.
- \`READY\` → hide the setup card and show the account card (\`payoutMethod\`: "•••• 4589 Guaranty Trust Bank", **Change account**) and **Withdraw**.

**Balance cards:** \`availableBalance\` ("Ready to withdraw"), \`pendingBalance\` ("Contributions still processing"), \`withdrawnToDate\` ("Total sent to your bank account"). All in kobo.

**Withdraw button:** if \`canWithdraw\` is false only because \`availableBalance < minimumWithdrawal\`, show the "You’re below the minimum" modal.

Payout history comes from \`GET /creators/me/payouts\`. Quick flags are also on \`GET /users/me\` and \`GET /creators/me\`: \`isKycCompleted\`, \`isBankAccountConnected\`.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Creator balance overview returned successfully.',
    type: DashboardBalanceDto,
  })
  @ApiErrors(UNAUTHORIZED_ERROR, CREATOR_NOT_FOUND_ERROR)
  async getBalanceAlias(
    @CurrentUser('id') userId: string,
  ): Promise<DashboardBalanceDto> {
    return this.creatorsService.getDashboardBalance(userId);
  }

  @Get('me/analytics/earnings')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary:
      'Get creator earnings chart data (alias for /creators/me/dashboard/earnings)',
    description:
      'Alias for GET /creators/me/dashboard/earnings matching CREATOR_DASHBOARD_OVERVIEW_ENDPOINTS.md spec.',
  })
  @ApiResponse({
    status: 200,
    description: 'Earnings chart data returned successfully.',
    type: DashboardEarningsChartDto,
  })
  async getEarningsAlias(
    @CurrentUser('id') userId: string,
    @Query() query: DashboardEarningsQueryDto,
  ): Promise<DashboardEarningsChartDto> {
    return this.creatorsService.getDashboardEarnings(userId, query);
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
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid session token.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict — slug is already taken.',
    type: ErrorResponseDto,
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
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ErrorResponseDto,
  })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    const profile = await this.creatorsService.updateProfile(userId, dto);
    return this.creatorsService.formatCreatorProfile(profile);
  }

  @Put('me/thank-you-message')
  @ApiBearerAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: 'Set or clear the creator thank-you message',
    description:
      'Replaces the thank-you message shown to supporters after payment. Send null or blank text to clear it, which falls back to the platform default. The thankYouMessage key is required.',
  })
  @ApiBody({
    type: UpdateThankYouMessageDto,
    examples: {
      set: {
        summary: 'Set a message',
        value: { thankYouMessage: 'Thank you for the yard! 🙏' },
      },
      clear: {
        summary: 'Clear it (use the default)',
        value: { thankYouMessage: null },
      },
    },
  })
  @ApiResponse({ status: 200, type: CreatorProfileDataDto })
  @ApiErrors(VALIDATION_ERROR, UNAUTHORIZED_ERROR, CREATOR_NOT_FOUND_ERROR)
  async updateThankYouMessage(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateThankYouMessageDto,
  ) {
    const profile = await this.creatorsService.updateCreatorSettings(userId, {
      thankYouMessage: dto.thankYouMessage ?? '',
    });
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
    type: ErrorResponseDto,
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
    type: ErrorResponseDto,
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
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ErrorResponseDto,
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
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ErrorResponseDto,
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
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid session token.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ErrorResponseDto,
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
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid session token.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ErrorResponseDto,
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
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Creator profile not found.',
    type: ErrorResponseDto,
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
    type: ErrorResponseDto,
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
    type: ErrorResponseDto,
  })
  async getShareLinkBySlug(@Param('slug') slug: string) {
    return this.creatorsService.getShareLinkBySlug(slug);
  }

  @Public()
  @Get(':slug/supports/quote')
  @ApiOperation({
    summary: 'Preview the yard equivalent of a gift amount',
    description:
      'Powers "You\'re gifting ₦5,000 worth of Adire" on the gift form. Nothing is created. Uses the creator\'s theme fabric.',
  })
  @ApiParam({ name: 'slug', example: 'adeola' })
  @ApiResponse({ status: 200, type: SupportQuoteResponseDto })
  @ApiErrors(VALIDATION_ERROR, ...CREATOR_UNAVAILABLE_ERRORS, NO_MATERIAL_ERROR)
  async quoteSupport(
    @Param('slug') slug: string,
    @Query() query: SupportQuoteQueryDto,
  ) {
    return this.supportsService.quoteGift(slug, query);
  }

  @Public()
  @Post(':slug/supports/intent')
  @ApiOperation({
    summary: 'Create a guest support intent',
    description:
      'Public endpoint for a guest to start a gift to a creator. No authentication required. To get the Paystack checkout URL in the same call, use POST /creators/:slug/supports/checkout instead. Otherwise send the returned supportId to POST /payments/initialize.',
  })
  @ApiParam({
    name: 'slug',
    description: 'Creator slug handle (e.g. "adeola")',
    example: 'adeola',
  })
  @ApiBody({ type: CreateSupportIntentDto })
  @ApiResponse({ status: 201, type: SupportIntentResponseDto })
  @ApiErrors(VALIDATION_ERROR, ...CREATOR_UNAVAILABLE_ERRORS, NO_MATERIAL_ERROR)
  async createSupportIntent(
    @Param('slug') slug: string,
    @Body() dto: CreateSupportIntentDto,
  ) {
    return this.supportsService.createGuestIntent(slug, dto);
  }

  @Public()
  @Post(':slug/supports/checkout')
  @ApiOperation({
    summary: 'Start a gift and get the Paystack checkout URL in one call',
    description:
      'Public. Does what `supports/intent` then `POST /payments/initialize` do, in one request: creates the gift, opens a Paystack checkout and returns `authorizationUrl`. Redirect the supporter there. After paying, Paystack sends them to `callbackUrl` (we add `supportId`), where you confirm with GET /supports/:supportId/status.',
  })
  @ApiParam({ name: 'slug', example: 'adeola' })
  @ApiBody({ type: CheckoutGiftDto })
  @ApiResponse({ status: 201, type: CheckoutGiftResponseDto })
  @ApiErrors(VALIDATION_ERROR, ...CREATOR_UNAVAILABLE_ERRORS, NO_MATERIAL_ERROR)
  async checkoutGift(
    @Param('slug') slug: string,
    @Body() dto: CheckoutGiftDto,
  ): Promise<CheckoutGiftResponseDto> {
    // Reject a bad callbackUrl before anything is created
    resolveCallbackUrl(dto.callbackUrl);
    const intent = await this.supportsService.createGuestIntent(slug, dto);
    const payment = await this.paymentsService.initializePayment(
      intent.supportId,
      dto.email,
      dto.callbackUrl,
    );
    return {
      ...intent,
      paymentId: payment.paymentId,
      authorizationUrl: payment.authorizationUrl,
    };
  }

  @Public()
  @Get(':slug/supports')
  @ApiOperation({
    summary: 'Get the public supporter wall',
    description:
      'Paginated feed of paid gifts, newest first, plus the supporter count for the page header. Anonymous gifts hide the name and message. Returns an empty list and a null count if the creator turned the wall off.',
  })
  @ApiParam({ name: 'slug', example: 'adeola' })
  @ApiResponse({ status: 200, type: SupportWallResponseDto })
  @ApiErrors(VALIDATION_ERROR, CREATOR_UNAVAILABLE_ERRORS[0])
  async getSupporterWall(
    @Param('slug') slug: string,
    @Query() query: SupportWallQueryDto,
  ) {
    return this.supportsService.getPublicWall(slug, query);
  }
}
