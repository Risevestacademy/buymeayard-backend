import { Controller, Post, Get, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PayoutsService } from './payouts.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('payouts')
@ApiBearerAuth()
@Controller('creators/me')
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get('balance')
  @ApiOperation({ summary: 'Get current creator available balance' })
  async getBalance(@CurrentUser('id') userId: string) {
    return this.payoutsService.getCreatorBalance(userId);
  }

  @Post('payouts')
  @ApiOperation({ summary: 'Request a creator payout' })
  async requestPayout(
    @CurrentUser('id') userId: string,
    @Body() body: { amount: number; currency?: string },
  ) {
    return this.payoutsService.requestPayout(
      userId,
      body.amount,
      body.currency,
    );
  }
}
