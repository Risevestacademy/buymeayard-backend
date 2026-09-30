export interface InitializePaymentParams {
  paymentId: string;
  supportId: string;
  amount: number | bigint; // minor units
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
  amount: number | bigint; // minor units
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

export interface ResolveAccountParams {
  accountNumber: string;
  bankCode: string;
}

export interface ResolveAccountResult {
  accountNumber: string;
  accountName: string;
  bankCode: string;
}

export interface CreateTransferRecipientParams {
  name: string;
  accountNumber: string;
  bankCode: string;
  currency?: string;
  description?: string;
}

export interface CreateTransferRecipientResult {
  recipientCode: string;
  recipientId?: string;
  name: string;
  accountNumber: string;
  bankCode: string;
}

export interface InitiateTransferParams {
  amount: number | bigint; // minor units
  recipientCode: string;
  reference: string;
  reason?: string;
  currency?: string;
}

export interface InitiateTransferResult {
  success: boolean;
  transferCode: string;
  reference: string;
  status: string;
  amount: number | bigint;
  currency: string;
}

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
  resolveAccountNumber(
    params: ResolveAccountParams,
  ): Promise<ResolveAccountResult>;
  createTransferRecipient(
    params: CreateTransferRecipientParams,
  ): Promise<CreateTransferRecipientResult>;
  initiateTransfer(
    params: InitiateTransferParams,
  ): Promise<InitiateTransferResult>;
}
