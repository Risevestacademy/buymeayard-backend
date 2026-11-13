export interface InitializePaymentParams {
  paymentId: string;
  supportId: string;
  amount: number; // minor units
  currency: string;
  email: string;
  metadata?: Record<string, any>;
  callbackUrl?: string;
}

export interface InitializePaymentResult {
  providerReference: string;
  authorizationUrl: string;
  accessCode?: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  providerReference: string;
  providerTransactionId?: string;
  amount: number; // minor units
  currency: string;
  status: string;
  paidAt?: Date;
  metadata?: Record<string, any>;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  eventType?: string;
  eventReference?: string;
  data?: any;
}

export interface Bank {
  name: string;
  code: string;
  /** Providers without a slug (Bachs) get one made from the name. */
  slug: string;
}

export interface ResolveAccountResult {
  accountName: string;
  accountNumber: string;
}

export interface CreateTransferRecipientParams {
  accountName: string;
  accountNumber: string;
  bankCode: string;
  /** Our creator profile id. Providers that keep a per-creator account use it as an idempotency key. */
  creatorId?: string;
  email?: string;
  /** The creator's previous recipient code, so a provider can reuse their account. */
  previousRecipientCode?: string | null;
}

export interface InitiateTransferParams {
  /** What the bank receives, in minor units. The provider's own fee is on top of it. */
  amount: number; // minor units
  recipientCode: string;
  reference: string;
  reason?: string;
}

/** Normalized transfer state: Paystack's otp/received/queued all map to PENDING. */
export type TransferStatus =
  'PENDING' | 'SUCCESS' | 'FAILED' | 'REVERSED' | 'NOT_FOUND';

export interface TransferResult {
  status: TransferStatus;
  transferCode?: string;
  failureReason?: string;
}

export interface RefundParams {
  /** Reference of the original payment (the provider's transaction reference). */
  paymentReference: string;
  /** The provider's id for the charge, when it has one (Bachs refunds by charge id). */
  providerTransactionId?: string | null;
  amount: number; // minor units
  reason?: string;
}

/** Paystack: pending/processing resolve later via webhook; processed is final. */
export type RefundStatus = 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED';

export interface RefundResult {
  status: RefundStatus;
  providerRefundId?: string;
  failureReason?: string;
}

/**
 * Thrown when the provider rejected a request outright (bad account, invalid
 * recipient, insufficient platform balance), as opposed to a network error
 * where the outcome is unknown.
 */
export class PaymentProviderRejectedError extends Error {}

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';

export interface PaymentProvider {
  readonly providerName: string;
  /**
   * What the provider charges per payout, in minor units, on top of the amount
   * sent. It is added to the creator's processing fee. Omitted when 0.
   */
  readonly payoutFee?: number;
  /**
   * True when sending the same payout again is safe, because the provider
   * de-duplicates on our reference. Lets an admin retry a payout whose first
   * attempt has no provider id.
   */
  readonly transfersAreIdempotent?: boolean;
  initializePayment(
    params: InitializePaymentParams,
  ): Promise<InitializePaymentResult>;
  verifyPayment(reference: string): Promise<VerifyPaymentResult>;
  verifyWebhookSignature(
    signature: string,
    rawBody: string | Buffer,
  ): Promise<WebhookVerificationResult>;
  /**
   * Turns the provider's webhook body into the internal event shape the
   * payment handler understands: `{ event, event_id, data: { id, reference } }`
   * with `charge.success`, `transfer.success|failed|reversed` and
   * `refund.processed|failed`. Anything else comes back as `{ event: 'ignored' }`.
   * Providers whose body already has that shape may omit it.
   */
  normalizeWebhook?(payload: any): any;

  // Payouts
  listBanks(): Promise<Bank[]>;
  resolveAccount(
    accountNumber: string,
    bankCode: string,
  ): Promise<ResolveAccountResult>;
  createTransferRecipient(
    params: CreateTransferRecipientParams,
  ): Promise<string>;
  initiateTransfer(params: InitiateTransferParams): Promise<TransferResult>;
  /**
   * `transferCode` is the code `initiateTransfer` returned, if we have one.
   * NOT_FOUND must only be returned when the provider can prove nothing moved,
   * because the caller then gives the money back to the creator.
   */
  verifyTransfer(
    reference: string,
    transferCode?: string | null,
  ): Promise<TransferResult>;

  // Refunds
  refundPayment(params: RefundParams): Promise<RefundResult>;
}
