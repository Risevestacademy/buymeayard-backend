import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Param,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import {
  ApiErrors,
  VALIDATION_ERROR,
} from '../../common/decorators/api-errors.decorator';
import { PaymentsService } from './payments.service';
import { Public } from '../../common/decorators/public.decorator';
import {
  InitializePaymentDto,
  InitializePaymentResponseDto,
} from './dto/initialize-payment.dto';
import { SupportStatusResponseDto } from './dto/support-status.dto';

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @Post('payments/initialize')
  @ApiOperation({
    summary: 'Initialize Paystack payment for a support order',
    description:
      'Public, so a guest can pay for the support they just created. The unguessable support id is the only credential, and it only lets the caller pay, never read anything.',
  })
  @ApiResponse({ status: 201, type: InitializePaymentResponseDto })
  @ApiErrors(
    VALIDATION_ERROR,
    {
      status: 400,
      code: 'PAYMENT_ALREADY_PROCESSED',
      message: 'This payment has already been processed',
      when: 'The support is already paid. Show the thank-you screen instead of opening checkout.',
    },
    {
      status: 403,
      code: 'CREATOR_NOT_ACTIVE',
      message: 'This creator is not accepting contributions yet',
      when: 'The creator lost verification or took their page down since the intent was created.',
    },
    {
      status: 404,
      code: 'NOT_FOUND',
      message: 'Support transaction not found',
      when: 'The supportId does not exist.',
    },
  )
  async initialize(@Body() body: InitializePaymentDto) {
    return this.paymentsService.initializePayment(
      body.supportId,
      body.email,
      body.callbackUrl,
    );
  }

  @Public()
  @Get('supports/:supportId/status')
  @ApiOperation({
    summary: 'Check whether a gift has been paid',
    description:
      'For the page Paystack sends the supporter back to. Paystack confirms the payment by webhook, which can land a few seconds after the redirect, so poll this every second or two (up to about 15 seconds) until `paid` is true, then show `thankYouMessage`. Never treat the redirect itself as proof of payment. The unguessable support id is the only credential.',
  })
  @ApiParam({ name: 'supportId', description: 'From the intent/checkout call' })
  @ApiResponse({ status: 200, type: SupportStatusResponseDto })
  @ApiErrors(VALIDATION_ERROR, {
    status: 404,
    code: 'NOT_FOUND',
    message: 'Support transaction not found',
    when: 'The supportId does not exist.',
  })
  async supportStatus(
    @Param('supportId', ParseUUIDPipe) supportId: string,
  ): Promise<SupportStatusResponseDto> {
    return this.paymentsService.getSupportStatus(supportId);
  }

  @Public()
  @Post('webhooks/paystack')
  @ApiOperation({
    summary:
      'Handle Paystack webhook events (called by Paystack, not the apps)',
    description: `Configure in Paystack: *Settings → API Keys & Webhooks → Webhook URL* = \`https://<api-domain>/webhooks/paystack\` (no \`/api/v1\`).

The \`x-paystack-signature\` header must be the HMAC-SHA512 of the raw body using \`PAYSTACK_WEBHOOK_SECRET\`, which must equal the Paystack secret key.

Handled events:
- \`charge.success\`: a contribution was paid. Credits the creator's balance.
- \`transfer.success\`: a payout reached the bank. "Money landed" notification.
- \`transfer.failed\` / \`transfer.reversed\`: the payout failed. The full amount goes back to the balance, plus a "Withdrawal didn’t go through" notification.

Repeated deliveries of the same event are ignored (\`{ status: "already_processed" }\`).`,
  })
  async handlePaystackWebhook(
    @Headers('x-paystack-signature') signature: string,
    @Body() payload: any,
    @Req() req: any,
  ) {
    const rawBody = req.rawBody || JSON.stringify(payload);
    return this.paymentsService.handleWebhook(signature, payload, rawBody);
  }
}
