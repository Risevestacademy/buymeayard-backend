import {
  Controller,
  Get,
  Put,
  Post,
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
import {
  CreatorResponseDto,
  CreatorListResponseDto,
  CreatorMaterialResponseDto,
  AvatarUploadResponseDto,
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
    type: CreatorResponseDto,
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
    type: CreatorResponseDto,
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
}
