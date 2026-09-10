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
}
