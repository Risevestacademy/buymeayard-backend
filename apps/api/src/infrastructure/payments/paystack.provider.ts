import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  CreateTransferRecipientParams,
  CreateTransferRecipientResult,
  InitializePaymentParams,
  InitializePaymentResult,
  InitiateTransferParams,
  InitiateTransferResult,
  PaymentProvider,
  ResolveAccountParams,
  ResolveAccountResult,
  VerifyPaymentResult,
  WebhookVerificationResult,
} from './payment-provider.interface';

@Injectable()
export class PaystackProvider implements PaymentProvider {
  readonly providerName = 'PAYSTACK';
  private readonly logger = new Logger(PaystackProvider.name);
  private readonly secretKey: string;
  private readonly webhookSecret: string;
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(private readonly configService: ConfigService) {
    this.secretKey =
      this.configService.get<string>('PAYSTACK_SECRET_KEY') || '';
    this.webhookSecret =
      this.configService.get<string>('PAYSTACK_WEBHOOK_SECRET') ||
      this.secretKey;
  }

  private get isMockMode(): boolean {
    return (
      !this.secretKey ||
      this.secretKey === 'sk_test_mock' ||
      this.secretKey.startsWith('sk_test_mock') ||
      this.secretKey.includes('xxx') ||
      this.secretKey.length < 20
    );
  }

  private async apiRequest<T = any>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(options.headers || {}),
        },
      });

      const json = await response.json();
      if (!response.ok || !json.status) {
        const errorMsg =
          json.message ||
          `Paystack request failed with status ${response.status}`;
        this.logger.error(`Paystack API error on ${path}: ${errorMsg}`);
        throw new BadRequestException(errorMsg);
      }
      return json.data;
    } catch (err: any) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      this.logger.error(
        `Paystack network error on ${path}: ${err.message}`,
        err.stack,
      );
      throw new BadRequestException(
        `Failed to communicate with payment gateway: ${err.message}`,
      );
    }
  }

  async initializePayment(
    params: InitializePaymentParams,
  ): Promise<InitializePaymentResult> {
    this.logger.log(
      `Initializing Paystack transaction for payment: ${params.paymentId}`,
    );

    if (this.isMockMode) {
      const providerReference = `pstk_ref_${Date.now()}_${params.paymentId.slice(0, 8)}`;
      return {
        providerReference,
        authorizationUrl: `https://checkout.paystack.com/mock-auth-${params.paymentId}`,
        accessCode: `mock_code_${params.paymentId.slice(0, 8)}`,
      };
    }

    const payload: Record<string, any> = {
      email: params.email,
      amount:
        typeof params.amount === 'bigint'
          ? Number(params.amount)
          : params.amount, // amount in kobo
      currency: params.currency || 'NGN',
      reference: `pstk_${Date.now()}_${params.paymentId.slice(0, 8)}`,
      callback_url: params.callbackUrl,
      metadata: {
        paymentId: params.paymentId,
        supportId: params.supportId,
        ...(params.metadata || {}),
      },
    };

    const data = await this.apiRequest<{
      authorization_url: string;
      access_code: string;
      reference: string;
    }>('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return {
      providerReference: data.reference,
      authorizationUrl: data.authorization_url,
      accessCode: data.access_code,
    };
  }

  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    this.logger.log(`Verifying Paystack transaction: ${reference}`);

    if (this.isMockMode) {
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

    const data = await this.apiRequest<{
      status: string;
      reference: string;
      id: number;
      amount: number;
      currency: string;
      paid_at?: string;
      metadata?: Record<string, any>;
    }>(`/transaction/verify/${encodeURIComponent(reference)}`);

    const isSuccess = data.status === 'success';

    return {
      success: isSuccess,
      providerReference: data.reference,
      providerTransactionId: data.id ? data.id.toString() : undefined,
      amount: data.amount,
      currency: data.currency,
      status: isSuccess ? 'SUCCESS' : data.status.toUpperCase(),
      paidAt: data.paid_at ? new Date(data.paid_at) : undefined,
      metadata: data.metadata,
    };
  }

  async verifyWebhookSignature(
    signature: string,
    rawBody: string | Buffer,
  ): Promise<WebhookVerificationResult> {
    if (!signature || !this.webhookSecret) {
      return { isValid: false };
    }

    try {
      const hash = crypto
        .createHmac('sha512', this.webhookSecret)
        .update(rawBody)
        .digest('hex');

      const hashBuffer = Buffer.from(hash, 'utf8');
      const sigBuffer = Buffer.from(signature, 'utf8');

      if (hashBuffer.length !== sigBuffer.length) {
        return { isValid: false };
      }

      const isValid = crypto.timingSafeEqual(hashBuffer, sigBuffer);
      return { isValid };
    } catch {
      return { isValid: false };
    }
  }

  async resolveAccountNumber(
    params: ResolveAccountParams,
  ): Promise<ResolveAccountResult> {
    this.logger.log(
      `Resolving NUBAN: ${params.accountNumber} with bank code: ${params.bankCode}`,
    );

    if (this.isMockMode) {
      return {
        accountNumber: params.accountNumber,
        accountName: 'DEMO CREATOR ACCOUNT',
        bankCode: params.bankCode,
      };
    }

    const data = await this.apiRequest<{
      account_number: string;
      account_name: string;
      bank_id: number;
    }>(
      `/bank/resolve?account_number=${encodeURIComponent(
        params.accountNumber,
      )}&bank_code=${encodeURIComponent(params.bankCode)}`,
    );

    return {
      accountNumber: data.account_number,
      accountName: data.account_name,
      bankCode: params.bankCode,
    };
  }

  async createTransferRecipient(
    params: CreateTransferRecipientParams,
  ): Promise<CreateTransferRecipientResult> {
    this.logger.log(
      `Creating Paystack transfer recipient for ${params.name} (${params.accountNumber})`,
    );

    if (this.isMockMode) {
      return {
        recipientCode: `RCP_mock_${Date.now()}`,
        name: params.name,
        accountNumber: params.accountNumber,
        bankCode: params.bankCode,
      };
    }

    const payload = {
      type: 'nuban',
      name: params.name,
      account_number: params.accountNumber,
      bank_code: params.bankCode,
      currency: params.currency || 'NGN',
      description:
        params.description || `Creator payout account for ${params.name}`,
    };

    const data = await this.apiRequest<{
      recipient_code: string;
      id: number;
      name: string;
      details: {
        account_number: string;
        bank_code: string;
      };
    }>('/transferrecipient', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return {
      recipientCode: data.recipient_code,
      recipientId: data.id ? data.id.toString() : undefined,
      name: data.name,
      accountNumber: data.details?.account_number || params.accountNumber,
      bankCode: data.details?.bank_code || params.bankCode,
    };
  }

  async initiateTransfer(
    params: InitiateTransferParams,
  ): Promise<InitiateTransferResult> {
    this.logger.log(
      `Initiating Paystack transfer of ${params.amount} kobo to recipient ${params.recipientCode}`,
    );

    if (this.isMockMode) {
      return {
        success: true,
        transferCode: `TRF_mock_${Date.now()}`,
        reference: params.reference,
        status: 'pending',
        amount: params.amount,
        currency: params.currency || 'NGN',
      };
    }

    const payload = {
      source: 'balance',
      amount:
        typeof params.amount === 'bigint'
          ? Number(params.amount)
          : params.amount,
      recipient: params.recipientCode,
      reference: params.reference,
      reason: params.reason || 'Creator earnings withdrawal',
      currency: params.currency || 'NGN',
    };

    const data = await this.apiRequest<{
      transfer_code: string;
      reference: string;
      status: string;
      amount: number;
      currency: string;
    }>('/transfer', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return {
      success: true,
      transferCode: data.transfer_code,
      reference: data.reference,
      status: data.status,
      amount: data.amount,
      currency: data.currency,
    };
  }
}
