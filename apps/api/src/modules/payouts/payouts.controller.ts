import {
  Controller,
  Post,
  Get,
  Body,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { PayoutsService } from './payouts.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CreatePayoutMethodDto,
  PayoutMethodResponseDto,
} from './dto/create-payout-method.dto';
import {
  RequestPayoutDto,
  CreatorBalanceResponseDto,
  PayoutResponseDto,
} from './dto/request-payout.dto';

@ApiTags('payouts')
@ApiBearerAuth()
@ApiCookieAuth('better-auth.session_token')
@Controller('creators/me')
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Post('payout-methods')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add verified Nigerian bank account for creator payouts',
    description:
      'Resolves the NUBAN account name with Paystack and creates a transfer recipient code.',
  })
  @ApiResponse({
    status: 201,
    description:
      'Bank account resolved and payout method created successfully.',
    type: PayoutMethodResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Could not resolve bank account details with Paystack.',
  })
  async addPayoutMethod(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePayoutMethodDto,
  ) {
    return this.payoutsService.resolveAndAddPayoutMethod(userId, dto);
  }

  @Get('payout-methods')
  @ApiOperation({
    summary: 'Get creator verified payout methods',
    description:
      'Fetches configured payout accounts with masked account numbers.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of configured payout methods.',
    type: [PayoutMethodResponseDto],
  })
  async getPayoutMethods(@CurrentUser('id') userId: string) {
    return this.payoutsService.getPayoutMethods(userId);
  }

  @Get('balance')
  @ApiOperation({
    summary: 'Get real-time creator balance breakdown',
    description:
      'Returns available, pending, and total withdrawn balances computed from the financial ledger.',
  })
  @ApiResponse({
    status: 200,
    description: 'Balance breakdown returned successfully.',
    type: CreatorBalanceResponseDto,
  })
  async getBalance(@CurrentUser('id') userId: string) {
    return this.payoutsService.getCreatorBalance(userId);
  }

  @Post('payouts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Request withdrawal to registered bank account',
    description:
      'Validates KYC verification, locks funds in ledger, and initiates transfer via Paystack.',
  })
  @ApiResponse({
    status: 201,
    description: 'Payout requested and queued for processing.',
    type: PayoutResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Insufficient balance, KYC required, or missing payout method.',
  })
  async requestPayout(
    @CurrentUser('id') userId: string,
    @Body() dto: RequestPayoutDto,
  ) {
    return this.payoutsService.requestPayout(userId, dto.amount, dto.currency);
  }

  @Get('payouts')
  @ApiOperation({
    summary: 'Get creator payout withdrawal history',
    description:
      'Retrieves the list of past payouts with status, timestamps, and failure reasons if any.',
  })
  @ApiResponse({
    status: 200,
    description: 'Payout history returned successfully.',
    type: [PayoutResponseDto],
  })
  async getPayouts(@CurrentUser('id') userId: string) {
    return this.payoutsService.getPayoutHistory(userId);
  }
}
