export interface PaymentItemSnapshot {
  materialName: string;
  quantity: number;
  unitPrice: number | bigint;
  totalPrice: number | bigint;
}

export class PaymentCompletedEvent {
  constructor(
    public readonly paymentId: string,
    public readonly supportId: string,
    public readonly creatorId: string,
    public readonly supporterId: string,
    public readonly totalAmount: number | bigint, // in minor units (kobo)
    public readonly creatorAmount: number | bigint,
    public readonly platformFee: number | bigint,
    public readonly currency: string,
    public readonly supporterName?: string | null,
    public readonly supporterEmail?: string | null,
    public readonly message?: string | null,
    public readonly isAnonymous?: boolean,
    public readonly items: PaymentItemSnapshot[] = [],
  ) {}
}

export const PAYMENT_EVENTS = {
  COMPLETED: 'payment.completed',
} as const;
