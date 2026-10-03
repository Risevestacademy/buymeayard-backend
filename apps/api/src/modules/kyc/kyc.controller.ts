import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { UserRole } from '@buymeayard/types';
import { KycService } from './kyc.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StartKycSessionDto } from './dto/start-kyc-session.dto';
import {
  KycStatusResponseDto,
  StartKycSessionResponseDto,
} from './dto/kyc-response.dto';

@ApiTags('creators')
@ApiBearerAuth()
@ApiCookieAuth('better-auth.session_token')
@UseGuards(RolesGuard)
@Roles(UserRole.CREATOR)
@Controller('creators/me/kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Get current KYC verification status',
    description:
      'Returns the creator KYC verification status, whether identity verification is completed (isKycCompleted), whether contributions are enabled, and details of the latest attempt. Automatically syncs with Didit if a decision is pending.',
  })
  @ApiResponse({
    status: 200,
    description: 'KYC status returned.',
    type: KycStatusResponseDto,
  })
  async getMyKyc(@CurrentUser('id') userId: string) {
    return this.kycService.getMyKyc(userId);
  }

  @Post('session')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: 'x-client-type',
    required: false,
    description:
      'Send "mobile" from the React Native app to use the app deep-link callback.',
  })
  @ApiOperation({
    summary: 'Start or resume identity verification session (Zero-input)',
    description:
      'Initiates an identity verification session with Didit. Send an empty JSON object `{}` to let Didit present its own hosted UI for country selection, document upload, and 3D selfie check. Web: redirect creator to `verificationUrl` or open with Didit Web SDK. React Native: pass `sessionToken` to Didit React Native SDK.',
  })
  @ApiBody({
    required: false,
    description:
      'Optional. Send an empty JSON object `{}` to let Didit handle all document selection and selfie capture directly in its hosted UI. No form inputs required.',
    schema: {
      type: 'object',
      example: {},
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Session created or resumed.',
    type: StartKycSessionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid details.' })
  @ApiResponse({
    status: 409,
    description:
      'KYC_ALREADY_VERIFIED, KYC_UNDER_REVIEW or KYC_SESSION_IN_PROGRESS.',
  })
  @ApiResponse({ status: 429, description: 'KYC_ATTEMPT_LIMIT_REACHED.' })
  @ApiResponse({ status: 502, description: 'KYC_PROVIDER_ERROR.' })
  async startSession(
    @CurrentUser('id') userId: string,
    @Body() dto: StartKycSessionDto = {},
    @Req() req: Request,
  ) {
    return this.kycService.startSession(userId, dto, req.headers);
  }
}
