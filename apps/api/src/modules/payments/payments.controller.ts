import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { Public } from '../../common/decorators/public.decorator';
import {
  InitializePaymentDto,
  InitializePaymentResponseDto,
} from './dto/initialize-payment.dto';

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('payments/initialize')
  @ApiOperation({
    summary: 'Initialize Paystack payment for a support order',
    description:
      'Creates a pending payment record and generates a Paystack hosted checkout link.',
  })
  @ApiResponse({
    status: 201,
    description: 'Payment initialized successfully.',
    type: InitializePaymentResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Support order already paid or invalid request.',
  })
  @ApiResponse({
    status: 404,
    description: 'Support transaction not found.',
  })
  async initialize(@Body() dto: InitializePaymentDto) {
    return this.paymentsService.initializePayment(
      dto.supportId,
      dto.email,
      dto.callbackUrl,
    );
  }

  @Public()
  @Post('payments/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Paystack webhook receiver (standard endpoint)',
    description:
      'Processes charge.success, transfer.success, and transfer.failed events with HMAC SHA-512 verification.',
  })
  @ApiHeader({
    name: 'x-paystack-signature',
    description: 'HMAC SHA-512 signature computed with PAYSTACK_WEBHOOK_SECRET',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook acknowledged and processed idempotently.',
  })
  async handlePaymentWebhook(
    @Headers('x-paystack-signature') signature: string,
    @Body() payload: any,
    @Req() req: Request,
  ) {
    const rawBody = (req as any).rawBody || JSON.stringify(payload);
    return this.paymentsService.handleWebhook(signature, payload, rawBody);
  }

  @Public()
  @Post('webhooks/paystack')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Paystack webhook receiver (alias endpoint)',
    description:
      'Alias route for Paystack dashboard webhooks configured without /api/v1.',
  })
  async handlePaystackWebhook(
    @Headers('x-paystack-signature') signature: string,
    @Body() payload: any,
    @Req() req: Request,
  ) {
    const rawBody = (req as any).rawBody || JSON.stringify(payload);
    return this.paymentsService.handleWebhook(signature, payload, rawBody);
  }
}
