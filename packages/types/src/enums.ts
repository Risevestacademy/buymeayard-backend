export enum UserRole {
  SUPPORTER = 'SUPPORTER',
  CREATOR = 'CREATOR',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
  MODERATOR = 'MODERATOR',
  FINANCE = 'FINANCE',
  SUPPORT = 'SUPPORT',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  BANNED = 'BANNED',
  DEACTIVATED = 'DEACTIVATED',
}

export enum CreatorStatus {
  REGISTERED = 'REGISTERED',
  PROFILE_CREATED = 'PROFILE_CREATED',
  KYC_PENDING = 'KYC_PENDING',
  VERIFIED = 'VERIFIED',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  BANNED = 'BANNED',
  DEACTIVATED = 'DEACTIVATED',
}

/** Creator-level KYC status (creator_profiles.kycStatus). */
export enum KycStatus {
  NOT_SUBMITTED = 'NOT_SUBMITTED',
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  EXPIRED = 'EXPIRED', // Previously verified, expired by the provider's policy
}

/** Status of a single verification attempt (kyc_submissions.status). */
export enum KycSubmissionStatus {
  CREATED = 'CREATED', // Session created, user has not started
  IN_PROGRESS = 'IN_PROGRESS',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  RESUBMISSION_REQUIRED = 'RESUBMISSION_REQUIRED',
  ABANDONED = 'ABANDONED', // User did not finish in time
  EXPIRED = 'EXPIRED', // Session expired before the user opened it
  KYC_EXPIRED = 'KYC_EXPIRED', // Approved verification later expired
  CANCELLED = 'CANCELLED', // Superseded by the platform (e.g. details changed)
}

export enum KycProviderName {
  DIDIT = 'DIDIT',
}

export enum KycDocumentType {
  NATIONAL_ID = 'NATIONAL_ID', // NIN card / NIN slip
  PASSPORT = 'PASSPORT',
  DRIVERS_LICENCE = 'DRIVERS_LICENCE',
  VOTERS_CARD = 'VOTERS_CARD',
}

export enum KycReviewSource {
  WEBHOOK = 'WEBHOOK',
  ADMIN = 'ADMIN',
  RECONCILE = 'RECONCILE',
  SYSTEM = 'SYSTEM',
}

export enum SupportStatus {
  CREATED = 'CREATED',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  PAID = 'PAID',
  COMPLETED = 'COMPLETED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  CHARGEBACK = 'CHARGEBACK',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  CHARGEBACK = 'CHARGEBACK',
}

export enum PaymentProviderName {
  PAYSTACK = 'PAYSTACK',
}

export enum AccountType {
  CREATOR = 'CREATOR',
  PLATFORM = 'PLATFORM',
}

export enum LedgerEntryType {
  SUPPORT_PAYMENT = 'SUPPORT_PAYMENT',
  PLATFORM_FEE = 'PLATFORM_FEE',
  PAYOUT_RESERVATION = 'PAYOUT_RESERVATION',
  PAYOUT_COMPLETED = 'PAYOUT_COMPLETED',
  PAYOUT_REVERSED = 'PAYOUT_REVERSED',
  REFUND = 'REFUND',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum LedgerDirection {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

export enum PayoutStatus {
  REQUESTED = 'REQUESTED',
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum PostVisibility {
  PUBLIC = 'PUBLIC',
  EXCLUSIVE = 'EXCLUSIVE',
}

export enum PostStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export enum ModerationStatus {
  CLEAN = 'CLEAN',
  FLAGGED = 'FLAGGED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  REMOVED = 'REMOVED',
}

export enum Currency {
  NGN = 'NGN',
}

export enum NotificationCategory {
  PAYOUT = 'PAYOUT',
  CONTRIBUTION = 'CONTRIBUTION',
  SECURITY = 'SECURITY',
  KYC = 'KYC',
  GENERAL = 'GENERAL',
}
