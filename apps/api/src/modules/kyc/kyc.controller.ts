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

@ApiTags('kyc')
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
    summary: 'Get my KYC status',
    description:
      'Returns the creator KYC status, whether contributions are enabled, prefill values for the details step, and the latest attempt. Syncs with the provider if a result is overdue.',
  })
  @ApiResponse({ status: 200, description: 'KYC status returned.' })
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
    summary: 'Start or resume identity verification',
    description:
      'Submits the confirmed details and returns a Didit session. Web: pass verificationUrl to the Didit web SDK. React Native: pass sessionToken to the Didit RN SDK. Returns the existing session when an unfinished one exists with the same details.',
  })
  @ApiResponse({ status: 200, description: 'Session created or resumed.' })
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
    @Body() dto: StartKycSessionDto,
    @Req() req: Request,
  ) {
    return this.kycService.startSession(userId, dto, req.headers);
  }
}
