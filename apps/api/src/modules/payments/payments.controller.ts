import { Controller, Post, Body, Headers, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('payments/initialize')
  @ApiOperation({ summary: 'Initialize Paystack payment for a support order' })
  async initialize(@Body() body: { supportId: string; email: string }) {
    return this.paymentsService.initializePayment(body.supportId, body.email);
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
