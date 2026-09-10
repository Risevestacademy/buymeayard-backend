import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  InitializePaymentParams,
  InitializePaymentResult,
  PaymentProvider,
  VerifyPaymentResult,
  WebhookVerificationResult,
} from './payment-provider.interface';

@Injectable()
export class PaystackProvider implements PaymentProvider {
  readonly providerName = 'PAYSTACK';
  private readonly logger = new Logger(PaystackProvider.name);
  private readonly secretKey: string;
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.secretKey =
      this.configService.get<string>('PAYSTACK_SECRET_KEY') || '';
    this.webhookSecret =
      this.configService.get<string>('PAYSTACK_WEBHOOK_SECRET') ||
      this.secretKey;
  }

  async initializePayment(
    params: InitializePaymentParams,
  ): Promise<InitializePaymentResult> {
    this.logger.log(
      `Initializing Paystack transaction for payment: ${params.paymentId}`,
    );
    // Provider integration logic will make HTTP call to https://api.paystack.co/transaction/initialize
    return {
      providerReference: `pstk_ref_${Date.now()}_${params.paymentId.slice(0, 8)}`,
      authorizationUrl: `https://checkout.paystack.com/mock-auth-${params.paymentId}`,
      accessCode: `mock_code_${params.paymentId.slice(0, 8)}`,
    };
  }

  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    this.logger.log(`Verifying Paystack transaction: ${reference}`);
    // Provider integration logic will call https://api.paystack.co/transaction/verify/${reference}
    return {
      success: true,
      providerReference: reference,
      providerTransactionId: `pstk_tx_${reference}`,
      amount: 0,
      currency: 'NGN',
      status: 'SUCCESS',
      paidAt: new Date(),
    };
  }

  async verifyWebhookSignature(
    signature: string,
    rawBody: string | Buffer,
  ): Promise<WebhookVerificationResult> {
    if (!signature) {
      return { isValid: false };
    }

    const hash = crypto
      .createHmac('sha512', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    const isValid = hash === signature;
    return { isValid };
  }
}
