import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { KycService } from './kyc.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('kyc')
@ApiBearerAuth()
@Controller('creators/me/kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post()
  @ApiOperation({ summary: 'Submit KYC information for creator' })
  async submitKyc(
    @CurrentUser('id') userId: string,
    @Body() body: Record<string, any>,
  ) {
    return this.kycService.submitKyc(userId, body);
  }
}
