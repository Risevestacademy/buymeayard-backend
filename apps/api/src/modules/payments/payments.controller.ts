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
  @ApiOperation({ summary: 'Handle Paystack webhook events' })
  async handlePaystackWebhook(
    @Headers('x-paystack-signature') signature: string,
    @Body() payload: any,
    @Req() req: any,
  ) {
    const rawBody = req.rawBody || JSON.stringify(payload);
    return this.paymentsService.handleWebhook(signature, payload, rawBody);
  }
}
