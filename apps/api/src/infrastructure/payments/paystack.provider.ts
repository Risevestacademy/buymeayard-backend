import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  Bank,
  InitializePaymentParams,
  InitializePaymentResult,
  InitiateTransferParams,
  PaymentProvider,
  PaymentProviderRejectedError,
  ResolveAccountResult,
  TransferResult,
  TransferStatus,
  VerifyPaymentResult,
  WebhookVerificationResult,
} from './payment-provider.interface';

const PAYSTACK_API = 'https://api.paystack.co';

// Used when no live secret key is configured (local dev and tests)
const MOCK_BANKS: Bank[] = [
  { name: 'Access Bank', code: '044', slug: 'access-bank' },
  { name: 'First Bank of Nigeria', code: '011', slug: 'first-bank-of-nigeria' },
  { name: 'Guaranty Trust Bank', code: '058', slug: 'guaranty-trust-bank' },
  { name: 'Kuda Bank', code: '50211', slug: 'kuda-bank' },
  { name: 'Opay', code: '999992', slug: 'paycom' },
  {
    name: 'United Bank For Africa',
    code: '033',
    slug: 'united-bank-for-africa',
  },
  { name: 'Zenith Bank', code: '057', slug: 'zenith-bank' },
];

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

  async listBanks(): Promise<Bank[]> {
    if (!this.isLive()) return MOCK_BANKS;

    const banks: Bank[] = [];
    let next: string | null = null;
    do {
      const query = new URLSearchParams({
        country: 'nigeria',
        currency: 'NGN',
        perPage: '100',
        use_cursor: 'true',
      });
      if (next) query.set('next', next);
      const res = await this.request<{
        data: { name: string; code: string; slug: string; active: boolean }[];
        meta?: { next?: string | null };
      }>('GET', `/bank?${query.toString()}`);
      banks.push(
        ...res.data
          .filter((b) => b.active)
          .map((b) => ({ name: b.name, code: b.code, slug: b.slug })),
      );
      next = res.meta?.next ?? null;
    } while (next);
    return banks;
  }

  async resolveAccount(
    accountNumber: string,
    bankCode: string,
  ): Promise<ResolveAccountResult> {
    if (!this.isLive()) {
      // 0000000000 lets local testing exercise the "couldn't verify" screen
      if (accountNumber === '0000000000') {
        throw new PaymentProviderRejectedError('Could not resolve account');
      }
      return { accountName: 'MOCK ACCOUNT HOLDER', accountNumber };
    }

    const query = new URLSearchParams({
      account_number: accountNumber,
      bank_code: bankCode,
    });
    const res = await this.request<{
      data: { account_name: string; account_number: string };
    }>('GET', `/bank/resolve?${query.toString()}`);
    return {
      accountName: res.data.account_name,
      accountNumber: res.data.account_number,
    };
  }

  async createTransferRecipient(params: {
    accountName: string;
    accountNumber: string;
    bankCode: string;
  }): Promise<string> {
    if (!this.isLive()) return `RCP_mock_${params.accountNumber.slice(-4)}`;

    const res = await this.request<{ data: { recipient_code: string } }>(
      'POST',
      '/transferrecipient',
      {
        type: 'nuban',
        name: params.accountName,
        account_number: params.accountNumber,
        bank_code: params.bankCode,
        currency: 'NGN',
      },
    );
    return res.data.recipient_code;
  }

  async initiateTransfer(
    params: InitiateTransferParams,
  ): Promise<TransferResult> {
    if (!this.isLive()) {
      return {
        status: 'PENDING',
        transferCode: `TRF_mock_${params.reference}`,
      };
    }

    const res = await this.request<{
      data: { transfer_code: string; status: string };
    }>('POST', '/transfer', {
      source: 'balance',
      amount: params.amount,
      recipient: params.recipientCode,
      reference: params.reference,
      reason: params.reason,
    });
    if (res.data.status === 'otp') {
      // Nobody can enter an OTP for an API-initiated transfer
      throw new PaymentProviderRejectedError(
        'Transfer requires OTP approval; disable transfer OTP on the Paystack account',
      );
    }
    return {
      status: this.mapTransferStatus(res.data.status),
      transferCode: res.data.transfer_code,
    };
  }

  async verifyTransfer(reference: string): Promise<TransferResult> {
    if (!this.isLive()) return { status: 'PENDING' };

    try {
      const res = await this.request<{
        data: { transfer_code: string; status: string; reason?: string };
      }>('GET', `/transfer/verify/${encodeURIComponent(reference)}`);
      return {
        status: this.mapTransferStatus(res.data.status),
        transferCode: res.data.transfer_code,
      };
    } catch (error) {
      if (error instanceof PaymentProviderRejectedError) {
        return { status: 'NOT_FOUND' };
      }
      throw error;
    }
  }

  private isLive(): boolean {
    return (
      !!this.secretKey &&
      !this.secretKey.includes('mock') &&
      !this.secretKey.includes('xxx')
    );
  }

  private mapTransferStatus(status: string): TransferStatus {
    switch (status) {
      case 'success':
        return 'SUCCESS';
      case 'failed':
      case 'abandoned':
      case 'rejected':
        return 'FAILED';
      case 'reversed':
        return 'REVERSED';
      default:
        return 'PENDING'; // pending, received, queued, processing
    }
  }

  /**
   * Calls the Paystack API. A 4xx answer (other than rate limiting) throws
   * PaymentProviderRejectedError; network errors and 5xx throw a plain Error,
   * since the request may or may not have taken effect.
   */
  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(`${PAYSTACK_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await response.json().catch(() => ({}))) as {
      status?: boolean;
      message?: string;
    };

    if (response.ok && data.status) return data as T;

    const message = data.message || `Paystack ${method} ${path} failed`;
    this.logger.warn(`Paystack ${response.status}: ${message}`);
    if (
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 429
    ) {
      throw new PaymentProviderRejectedError(message);
    }
    throw new Error(message);
  }
}
