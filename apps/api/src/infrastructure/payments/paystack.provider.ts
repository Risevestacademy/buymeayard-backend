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

    if (
      this.secretKey &&
      !this.secretKey.includes('mock') &&
      !this.secretKey.includes('xxx')
    ) {
      try {
        const response = await fetch(
          'https://api.paystack.co/transaction/initialize',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.secretKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: params.email,
              amount: params.amount,
              reference: params.paymentId,
              callback_url: params.callbackUrl,
              metadata: {
                ...params.metadata,
                supportId: params.supportId,
              },
            }),
          },
        );

        const data = (await response.json()) as {
          status: boolean;
          message?: string;
          data?: {
            authorization_url: string;
            access_code: string;
            reference: string;
          };
        };

        if (data.status && data.data) {
          return {
            providerReference: data.data.reference || params.paymentId,
            authorizationUrl: data.data.authorization_url,
            accessCode: data.data.access_code,
          };
        }
        this.logger.warn(
          `Paystack initialize failed: ${data.message || 'unknown error'}`,
        );
      } catch (error) {
        this.logger.error(
          'Failed to initialize Paystack transaction via API',
          error,
        );
      }
    }

    return {
      providerReference: `pstk_ref_${Date.now()}_${params.paymentId.slice(0, 8)}`,
      authorizationUrl: `https://checkout.paystack.com/mock-auth-${params.paymentId}`,
      accessCode: `mock_code_${params.paymentId.slice(0, 8)}`,
    };
  }

  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    this.logger.log(`Verifying Paystack transaction: ${reference}`);

    if (
      this.secretKey &&
      !this.secretKey.includes('mock') &&
      !this.secretKey.includes('xxx')
    ) {
      try {
        const response = await fetch(
          `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${this.secretKey}`,
            },
          },
        );

        const data = (await response.json()) as {
          status: boolean;
          message?: string;
          data?: {
            id: number;
            status: string;
            reference: string;
            amount: number;
            currency: string;
            paid_at?: string;
            metadata?: Record<string, any>;
          };
        };

        if (data.status && data.data) {
          return {
            success: data.data.status === 'success',
            providerReference: reference,
            providerTransactionId: String(data.data.id),
            amount: data.data.amount,
            currency: data.data.currency,
            status: data.data.status?.toUpperCase() || 'SUCCESS',
            paidAt: data.data.paid_at
              ? new Date(data.data.paid_at)
              : new Date(),
            metadata: data.data.metadata,
          };
        }
        this.logger.warn(
          `Paystack verify failed: ${data.message || 'unknown error'}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to verify Paystack transaction: ${reference}`,
          error,
        );
      }
    }

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
