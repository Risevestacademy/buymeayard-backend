export const PAYOUT_EVENTS = {
  CREATED: 'payout.created',
  PROCESSING: 'payout.processing',
  SUCCESS: 'payout.success',
  FAILED: 'payout.failed',
} as const;

export interface PayoutNotificationEvent {
  payoutId: string;
  creatorUserId: string;
  amount: number;
  netAmount?: number;
  currency?: string;
  bankName?: string;
  accountNumberMasked?: string;
  failureReason?: string;
}

export const CONTRIBUTION_EVENTS = {
  RECEIVED: 'contribution.received',
} as const;

export interface ContributionNotificationEvent {
  supportId: string;
  creatorUserId: string;
  supporterName: string;
  supporterEmail?: string;
  yards: number;
  materialName: string;
  amount: number;
  message?: string | null;
}

export const NOTIFICATION_SECURITY_EVENTS = {
  NEW_DEVICE_LOGIN: 'user.new_device_login',
} as const;

export interface NewDeviceLoginEvent {
  userId: string;
  email: string;
  deviceLabel: string;
  location: string;
  ipAddress?: string;
  sessionId?: string;
}

export const KYC_NOTIFICATION_EVENTS = {
  STATUS_CHANGED: 'kyc.status_changed',
} as const;

export interface KycNotificationEvent {
  creatorUserId: string;
  status: 'VERIFIED' | 'NEEDS_ATTENTION' | 'REJECTED';
  rejectionReason?: string | null;
  verifiedAt?: Date;
}
