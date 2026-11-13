import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  Bank,
  CreateTransferRecipientParams,
  InitializePaymentParams,
  InitializePaymentResult,
  InitiateTransferParams,
  PaymentProvider,
  PaymentProviderRejectedError,
  RefundParams,
  RefundResult,
  RefundStatus,
  ResolveAccountResult,
  TransferResult,
  TransferStatus,
  VerifyPaymentResult,
  WebhookVerificationResult,
} from './payment-provider.interface';

const LIVE_API = 'https://api.bachs.io';
const SANDBOX_API = 'https://sandbox-api.bachs.io';

/** A webhook older than this is treated as a replay (Bachs' recommended default). */
const WEBHOOK_TOLERANCE_SECONDS = 300;

/** 24 hours, the longest a checkout can stay open. */
const CHECKOUT_EXPIRY_MINUTES = 1440;

// Used when no real key is configured (local dev and tests)
const MOCK_BANKS: Bank[] = [
  { name: 'Access Bank', code: '044', slug: 'access-bank' },
  { name: 'First Bank of Nigeria', code: '011', slug: 'first-bank-of-nigeria' },
  { name: 'Guaranty Trust Bank', code: '058', slug: 'guaranty-trust-bank' },
  { name: 'Kuda Bank', code: '50211', slug: 'kuda-bank' },
  { name: 'Opay', code: '999992', slug: 'opay' },
  {
    name: 'United Bank For Africa',
    code: '033',
    slug: 'united-bank-for-africa',
  },
  { name: 'Zenith Bank', code: '057', slug: 'zenith-bank' },
];

interface RequestOptions {
  /** Acts on behalf of this connected account (X-Account-Id). */
  accountId?: string;
  idempotencyKey?: string;
}

/** `acct_x:pd_y` — the creator's Bachs account and their bank destination. */
export interface BachsRecipient {
  accountId: string;
  destinationId: string;
}

export function encodeRecipient(r: BachsRecipient): string {
  return `${r.accountId}:${r.destinationId}`;
}

export function decodeRecipient(code?: string | null): BachsRecipient | null {
  const [accountId, destinationId, ...rest] = (code ?? '').split(':');
  if (!accountId?.startsWith('acct_') || !destinationId || rest.length) {
    return null;
  }
  return { accountId, destinationId };
}

/** Bachs money is a decimal string in major units: "7000.00". */
export function toDecimal(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function fromDecimal(value: string | number | null | undefined): number {
  return Math.round(Number(value ?? 0) * 100);
}

/** Short stable digest, so an idempotency key changes when the body does. */
const digest = (...parts: string[]) =>
  crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Payments through Bachs: hosted checkout for contributions, and creator
 * payouts as a transfer into the creator's Bachs account followed by a payout
 * from that account to their own bank account.
 */
@Injectable()
export class BachsProvider implements PaymentProvider {
  readonly providerName = 'BACHS';
  readonly transfersAreIdempotent = true;
  readonly payoutFee: number;
  private readonly logger = new Logger(BachsProvider.name);
  private readonly apiKey: string;
  // One per webhook endpoint: account events and connected account events are separate endpoints
  private readonly webhookSecrets: string[];
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('BACHS_API_KEY') || '';
    this.webhookSecrets = (
      this.configService.get<string>('BACHS_WEBHOOK_SECRET') || ''
    )
      .split(',')
      .map((secret) => secret.trim())
      .filter(Boolean);
    this.baseUrl =
      this.configService.get<string>('BACHS_BASE_URL') ||
      (this.apiKey.startsWith('sk_live_') ? LIVE_API : SANDBOX_API);
    // Naira in the config, kobo everywhere else
    const feeNaira = Number(
      this.configService.get<number | string>('BACHS_PAYOUT_FEE') ?? 50,
    );
    this.payoutFee = Math.round(feeNaira * 100);
  }

  // ---------------------------------------------------------------------------
  // Collections
  // ---------------------------------------------------------------------------

  async initializePayment(
    params: InitializePaymentParams,
  ): Promise<InitializePaymentResult> {
    this.logger.log(`Creating Bachs checkout for payment: ${params.paymentId}`);

    if (!this.isLive()) {
      return {
        providerReference: `chk_mock_${params.paymentId.slice(0, 8)}`,
        authorizationUrl: `https://checkout.bachs.io/mock-${params.paymentId}`,
      };
    }

    const res = await this.request<{
      checkout_id: string;
      checkout_url: string;
    }>(
      'POST',
      '/v1/checkout-sessions',
      {
        pricing: {
          currency: params.currency,
          amount: toDecimal(params.amount),
          price_type: 'fixed',
        },
        customer: { email: params.email },
        reference: params.paymentId,
        success_url: params.callbackUrl,
        cancel_url: params.callbackUrl,
        expires_in_minutes: CHECKOUT_EXPIRY_MINUTES,
        metadata: {
          ...params.metadata,
          supportId: params.supportId,
          paymentId: params.paymentId,
        },
      },
      {
        // Same request -> same checkout; a retry with a new callback or email
        // is a different request and must not be refused as a key conflict
        idempotencyKey: `checkout-${params.paymentId}-${digest(
          params.callbackUrl ?? '',
          params.email,
          String(params.amount),
        )}`,
      },
    );
    return {
      providerReference: res.checkout_id,
      authorizationUrl: res.checkout_url,
    };
  }

  /** `reference` is the checkout id (chk_...) we stored as the provider reference. */
  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    if (!this.isLive()) {
      return {
        success: true,
        providerReference: reference,
        providerTransactionId: `ch_mock_${reference}`,
        amount: 0,
        currency: 'NGN',
        status: 'SUCCESS',
        paidAt: new Date(),
      };
    }

    const res = await this.request<{
      status: string;
      payment_status: string;
      amount: string;
      currency: string;
      completed_at?: string | null;
      charge?: { payment_id?: string; amount?: string } | null;
      metadata?: Record<string, any>;
    }>('GET', `/v1/checkout-sessions/${encodeURIComponent(reference)}`);
    return {
      success: res.payment_status === 'succeeded',
      providerReference: reference,
      providerTransactionId: res.charge?.payment_id,
      amount: fromDecimal(res.charge?.amount ?? res.amount),
      currency: res.currency,
      status: (res.payment_status || res.status || '').toUpperCase(),
      paidAt: res.completed_at ? new Date(res.completed_at) : undefined,
      metadata: res.metadata,
    };
  }

  /**
   * Bachs signs `{timestamp}.{raw body}` with HMAC-SHA256. `signature` is the
   * X-Bachs-Signature-V2 header (`t=...,v1=...`, several v1 values while a
   * secret is being rotated); the controller builds the same form from the
   * older X-Bachs-Signature + X-Bachs-Timestamp pair.
   */
  async verifyWebhookSignature(
    signature: string,
    rawBody: string | Buffer,
  ): Promise<WebhookVerificationResult> {
    if (!signature || this.webhookSecrets.length === 0) {
      return { isValid: false };
    }

    const pairs = signature
      .split(',')
      .map((part) => part.trim().split('='))
      .filter((p) => p.length >= 2)
      .map(([k, ...v]) => [k, v.join('=')] as const);
    const timestamp = Number(pairs.find(([k]) => k === 't')?.[1]);
    const candidates = pairs.filter(([k]) => k === 'v1').map(([, v]) => v);
    if (!Number.isFinite(timestamp) || candidates.length === 0) {
      return { isValid: false };
    }
    if (Math.abs(Date.now() / 1000 - timestamp) > WEBHOOK_TOLERANCE_SECONDS) {
      return { isValid: false };
    }

    const isValid = this.webhookSecrets.some((secret) => {
      const expected = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.`)
        .update(rawBody)
        .digest('hex');
      return candidates.some((candidate) => {
        const a = Buffer.from(candidate);
        const b = Buffer.from(expected);
        return a.length === b.length && crypto.timingSafeEqual(a, b);
      });
    });
    return { isValid };
  }

  /**
   * Maps Bachs events onto the internal shape the payment handler reads.
   * Only a checkout payment that was paid in full counts as a contribution;
   * virtual-account deposits have no checkout and are ignored.
   */
  normalizeWebhook(payload: any): any {
    const data = payload?.data ?? {};
    const base = { event_id: payload?.id };

    switch (payload?.type) {
      case 'collection.succeeded': {
        const paidInFull =
          data.status === 'SUCCEEDED' || data.status === 'OVERPAID';
        if (!data.checkout_id || !paidInFull) {
          this.logger.warn(
            `Ignoring collection.succeeded ${payload?.id}: status ${data.status}, checkout ${data.checkout_id ?? 'none'}`,
          );
          return { event: 'ignored', ...base };
        }
        return {
          event: 'charge.success',
          ...base,
          data: { id: data.charge_id, reference: data.checkout_id },
        };
      }
      case 'payout.paid':
        return {
          event: 'transfer.success',
          ...base,
          data: { id: data.withdrawal_id, reference: data.reference },
        };
      case 'payout.failed':
        return {
          event: 'transfer.failed',
          ...base,
          data: { id: data.withdrawal_id, reference: data.reference },
        };
      case 'refund.paid':
        return {
          event: 'refund.processed',
          ...base,
          data: { id: data.refund_id, charge_id: data.charge_id },
        };
      case 'refund.failed':
        return {
          event: 'refund.failed',
          ...base,
          data: { id: data.refund_id, charge_id: data.charge_id },
        };
      default:
        return { event: 'ignored', ...base };
    }
  }

  // ---------------------------------------------------------------------------
  // Banks
  // ---------------------------------------------------------------------------

  async listBanks(): Promise<Bank[]> {
    if (!this.isLive()) return MOCK_BANKS;

    const res = await this.request<{ banks: { name: string; code: string }[] }>(
      'GET',
      '/v1/reference/banks?country=NG',
    );
    return res.banks.map((b) => ({
      name: b.name,
      code: b.code,
      slug: slugify(b.name),
    }));
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

    const res = await this.request<{
      resolved: boolean;
      account_name: string | null;
      account_number: string | null;
      message: string | null;
    }>('POST', '/v1/misc/bank-accounts/resolve', {
      account_number: accountNumber,
      bank_code: bankCode,
      country: 'NG',
    });
    if (!res.resolved || !res.account_name) {
      throw new PaymentProviderRejectedError(
        res.message || 'Could not resolve account',
      );
    }
    return {
      accountName: res.account_name,
      accountNumber: res.account_number ?? accountNumber,
    };
  }

  // ---------------------------------------------------------------------------
  // Creator payouts
  // ---------------------------------------------------------------------------

  /**
   * Gets the creator a Bachs account that can receive transfers and pay out,
   * and registers their bank account on it. Returns `acct_x:pd_y`.
   *
   * The bank's account name must share a word with the person on the Bachs
   * account, so the person is named after the bank account holder.
   */
  async createTransferRecipient(
    params: CreateTransferRecipientParams,
  ): Promise<string> {
    if (!this.isLive()) {
      return encodeRecipient({
        accountId: 'acct_mock',
        destinationId: `pd_mock_${params.accountNumber.slice(-4)}`,
      });
    }
    if (!params.email) {
      throw new PaymentProviderRejectedError(
        'An email is needed to set up the payout account',
      );
    }

    const [firstName, ...rest] = params.accountName.trim().split(/\s+/);
    const lastName = rest.join(' ') || firstName;

    let accountId = decodeRecipient(params.previousRecipientCode)?.accountId;
    if (!accountId) {
      const account = await this.request<{ id: string }>(
        'POST',
        '/v1/accounts',
        {
          contact_email: params.email,
          display_name: params.accountName,
          first_name: firstName,
          last_name: lastName,
          country: 'NG',
          entity_type: 'individual',
          configuration: {
            recipient: {
              capabilities: {
                payouts: { requested: true },
                transfers: { requested: true },
              },
            },
          },
        },
        {
          idempotencyKey: `acct-${digest(params.creatorId ?? params.email, params.accountName)}`,
        },
      );
      accountId = account.id;
      await this.request(
        'POST',
        `/v1/accounts/${accountId}`,
        {
          fields: {
            persons: [
              {
                first_name: firstName,
                last_name: lastName,
                relationship: { representative: true },
              },
            ],
          },
        },
        {
          idempotencyKey: `acct-person-${accountId}-${digest(params.accountName)}`,
        },
      );
    }

    const destination = await this.request<{
      id: string;
      status?: string;
      status_reason?: string | null;
    }>(
      'POST',
      '/v1/payouts/destinations',
      {
        currency: 'NGN',
        name: params.accountName,
        account_number: params.accountNumber,
        bank_code: params.bankCode,
      },
      {
        accountId,
        idempotencyKey: `dest-${accountId}-${params.bankCode}-${params.accountNumber}`,
      },
    );
    if (destination.status === 'rejected') {
      throw new PaymentProviderRejectedError(
        destination.status_reason || 'The bank account was rejected',
      );
    }
    return encodeRecipient({ accountId, destinationId: destination.id });
  }

  /**
   * Sends `amount` to the creator's bank. The Bachs payout fee is charged on
   * top of the amount, so the creator's Bachs account is first funded with
   * amount + fee; after the payout it is back to zero.
   *
   * Both calls carry idempotency keys derived from `reference`, so repeating
   * this call after an unknown outcome cannot send the money twice.
   */
  async initiateTransfer(
    params: InitiateTransferParams,
  ): Promise<TransferResult> {
    if (!this.isLive()) {
      return {
        status: 'PENDING',
        transferCode: `acct_mock:pay_mock_${params.reference}`,
      };
    }

    const recipient = decodeRecipient(params.recipientCode);
    if (!recipient) {
      throw new PaymentProviderRejectedError(
        'This payout account was not set up with Bachs. Add the bank account again.',
      );
    }

    const account = await this.request<{
      capabilities?: Record<string, { status?: string }>;
    }>('GET', `/v1/accounts/${recipient.accountId}`);
    for (const capability of ['transfers', 'payouts']) {
      if (account.capabilities?.[capability]?.status !== 'active') {
        throw new PaymentProviderRejectedError(
          `The payout account is not verified yet (${capability}). Try again shortly.`,
        );
      }
    }

    const funded = toDecimal(params.amount + this.payoutFee);
    await this.request(
      'POST',
      '/v1/transfers',
      {
        destination: recipient.accountId,
        amount: funded,
        currency: 'NGN',
        transfer_group: params.reference,
        description: params.reason,
      },
      { idempotencyKey: `transfer-${params.reference}` },
    );

    let payout: {
      id: string;
      status: string;
      failure_reason?: string | null;
    };
    try {
      payout = await this.request(
        'POST',
        '/v1/payouts',
        {
          destination: recipient.destinationId,
          amount: toDecimal(params.amount),
          reference: params.reference,
          narration: 'BuyMeAYard',
        },
        {
          accountId: recipient.accountId,
          idempotencyKey: `payout-${params.reference}`,
        },
      );
    } catch (error) {
      if (error instanceof PaymentProviderRejectedError) {
        await this.takeBackFunding(recipient.accountId, funded, params);
      }
      throw error;
    }

    return {
      status: this.mapPayoutStatus(payout.status),
      transferCode: `${recipient.accountId}:${payout.id}`,
      failureReason: payout.failure_reason ?? undefined,
    };
  }

  /**
   * `transferCode` is `acct_x:pay_y`. Without it we cannot tell whether the
   * money moved, so the answer is PENDING and never NOT_FOUND: the caller
   * returns NOT_FOUND payouts to the creator's balance.
   */
  async verifyTransfer(
    reference: string,
    transferCode?: string | null,
  ): Promise<TransferResult> {
    if (!this.isLive()) return { status: 'PENDING' };

    const [accountId, payoutId] = (transferCode ?? '').split(':');
    if (!accountId || !payoutId) return { status: 'PENDING' };

    try {
      const payout = await this.request<{
        status: string;
        failure_reason?: string | null;
      }>('GET', `/v1/payouts/${encodeURIComponent(payoutId)}`, undefined, {
        accountId,
      });
      return {
        status: this.mapPayoutStatus(payout.status),
        transferCode: transferCode ?? undefined,
        failureReason: payout.failure_reason ?? undefined,
      };
    } catch (error) {
      if (error instanceof PaymentProviderRejectedError) {
        this.logger.warn(
          `Could not read payout ${payoutId} for ${reference}: ${error.message}`,
        );
        return { status: 'PENDING', transferCode: transferCode ?? undefined };
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Refunds
  // ---------------------------------------------------------------------------

  async refundPayment(params: RefundParams): Promise<RefundResult> {
    if (!this.isLive()) {
      return {
        status: 'PROCESSED',
        providerRefundId: `mock_refund_${Date.now()}`,
      };
    }

    const chargeId = params.providerTransactionId;
    if (!chargeId) {
      throw new PaymentProviderRejectedError(
        'This payment has no Bachs charge id, so it cannot be refunded here',
      );
    }

    const res = await this.request<{ refund_id: string; status: string }>(
      'POST',
      '/v1/refunds',
      {
        charge_id: chargeId,
        reference: `refund-${chargeId}`,
        amount: toDecimal(params.amount),
        reason: params.reason?.slice(0, 500),
      },
      { idempotencyKey: `refund-${chargeId}` },
    );
    return {
      status: this.mapRefundStatus(res.status),
      providerRefundId: res.refund_id,
    };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async takeBackFunding(
    accountId: string,
    funded: string,
    params: InitiateTransferParams,
  ) {
    try {
      await this.request(
        'POST',
        '/v1/transfers',
        {
          destination: 'self',
          amount: funded,
          currency: 'NGN',
          transfer_group: params.reference,
          description: `Return funds for ${params.reference}`,
        },
        { accountId, idempotencyKey: `return-${params.reference}` },
      );
    } catch (error) {
      // The creator's Bachs account still holds the money. Not a plain
      // rejection any more: someone has to move it back by hand.
      this.logger.error(
        `Payout ${params.reference} was rejected after funding ${accountId} with ${funded}, and returning the funds failed`,
        error,
      );
      throw new Error(
        `Payout ${params.reference} failed and ${funded} is still on Bachs account ${accountId}`,
      );
    }
  }

  mapRefundStatus(status: string): RefundStatus {
    switch (status) {
      case 'success':
      case 'paid':
        return 'PROCESSED';
      case 'failed':
        return 'FAILED';
      default:
        return 'PROCESSING';
    }
  }

  private mapPayoutStatus(status: string): TransferStatus {
    switch (status) {
      case 'completed':
        return 'SUCCESS';
      case 'failed':
        return 'FAILED';
      default:
        return 'PENDING'; // pending, processing
    }
  }

  private isLive(): boolean {
    return (
      !!this.apiKey &&
      !this.apiKey.includes('mock') &&
      !this.apiKey.includes('xxx')
    );
  }

  /**
   * Calls the Bachs API. A 4xx answer (other than 408 and 429) throws
   * PaymentProviderRejectedError; network errors, 5xx, 408 and 429 throw a
   * plain Error, since the request may or may not have taken effect.
   */
  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
    options: RequestOptions = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    };
    if (body) headers['Content-Type'] = 'application/json';
    if (options.accountId) headers['X-Account-Id'] = options.accountId;
    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await response.json().catch(() => ({}))) as {
      detail?: string;
      error_code?: string;
    };

    if (response.ok) return data as T;

    const message =
      data.detail || data.error_code || `Bachs ${method} ${path} failed`;
    this.logger.warn(`Bachs ${response.status} on ${path}: ${message}`);
    const transient = response.status === 408 || response.status === 429;
    if (response.status >= 400 && response.status < 500 && !transient) {
      throw new PaymentProviderRejectedError(message);
    }
    throw new Error(message);
  }
}
