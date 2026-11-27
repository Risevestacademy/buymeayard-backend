import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { KycService } from './kyc.service';

@Controller()
export class KycWebhookController {
  constructor(private readonly kycService: KycService) {}

  /**
   * Didit webhook receiver. Served at /webhooks/didit (outside the api/v1
   * prefix). Authenticated by HMAC signature, not by session.
   */
  @Public()
  @Post('webhooks/didit')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleDiditWebhook(@Req() req: RawBodyRequest<Request>) {
    return this.kycService.handleWebhook(req.headers, req.rawBody);
  }
}
