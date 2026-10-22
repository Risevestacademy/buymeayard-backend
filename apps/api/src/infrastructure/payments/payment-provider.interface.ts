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
  slug: string;
}

export interface ResolveAccountResult {
  accountName: string;
  accountNumber: string;
}

export interface InitiateTransferParams {
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

/**
 * Thrown when the provider rejected a request outright (bad account, invalid
 * recipient, insufficient platform balance), as opposed to a network error
 * where the outcome is unknown.
 */
export class PaymentProviderRejectedError extends Error {}

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';

export interface PaymentProvider {
  readonly providerName: string;
  initializePayment(
    params: InitializePaymentParams,
  ): Promise<InitializePaymentResult>;
  verifyPayment(reference: string): Promise<VerifyPaymentResult>;
  verifyWebhookSignature(
    signature: string,
    rawBody: string | Buffer,
  ): Promise<WebhookVerificationResult>;

  // Payouts
  listBanks(): Promise<Bank[]>;
  resolveAccount(
    accountNumber: string,
    bankCode: string,
  ): Promise<ResolveAccountResult>;
  createTransferRecipient(params: {
    accountName: string;
    accountNumber: string;
    bankCode: string;
  }): Promise<string>;
  initiateTransfer(params: InitiateTransferParams): Promise<TransferResult>;
  verifyTransfer(reference: string): Promise<TransferResult>;
}
