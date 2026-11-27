import {
  CreatorStatus,
  KycStatus,
  KycSubmissionStatus as S,
} from '@buymeayard/types';

/**
 * Pure KYC state rules. No I/O. Everything that changes KYC state goes
 * through these functions so the rules live in exactly one place.
 *
 * Core invariant: creator status ACTIVE  =>  kycStatus VERIFIED.
 */

/** Submissions a creator can still act on (resume). */
export const OPEN_SUBMISSION_STATUSES: ReadonlySet<string> = new Set([
  S.CREATED,
  S.IN_PROGRESS,
  S.RESUBMISSION_REQUIRED,
]);

/** Submissions whose provider state may still change without user action. */
export const RECONCILABLE_STATUSES: ReadonlySet<string> = new Set([
  S.CREATED,
  S.IN_PROGRESS,
  S.RESUBMISSION_REQUIRED,
  S.NEEDS_REVIEW,
]);

const ALLOWED_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  [S.CREATED]: new Set([
    S.IN_PROGRESS,
    S.NEEDS_REVIEW,
    S.VERIFIED,
    S.REJECTED,
    S.RESUBMISSION_REQUIRED,
    S.ABANDONED,
    S.EXPIRED,
    S.CANCELLED,
  ]),
  [S.IN_PROGRESS]: new Set([
    S.NEEDS_REVIEW,
    S.VERIFIED,
    S.REJECTED,
    S.RESUBMISSION_REQUIRED,
    S.ABANDONED,
    S.EXPIRED,
    S.CANCELLED,
  ]),
  [S.RESUBMISSION_REQUIRED]: new Set([
    S.IN_PROGRESS,
    S.NEEDS_REVIEW,
    S.VERIFIED,
    S.REJECTED,
    S.ABANDONED,
    S.EXPIRED,
    S.CANCELLED,
  ]),
  [S.NEEDS_REVIEW]: new Set([S.VERIFIED, S.REJECTED, S.RESUBMISSION_REQUIRED]),
  // Revocation (admin or provider reviewer) or provider expiry policy.
  [S.VERIFIED]: new Set([S.REJECTED, S.KYC_EXPIRED]),
  // Reviewer overrides of a finished decision.
  [S.REJECTED]: new Set([S.VERIFIED, S.RESUBMISSION_REQUIRED]),
  [S.ABANDONED]: new Set([S.VERIFIED, S.REJECTED, S.RESUBMISSION_REQUIRED]),
  // Frozen: a new session is required.
  [S.EXPIRED]: new Set(),
  [S.KYC_EXPIRED]: new Set(),
  [S.CANCELLED]: new Set(),
};

export type TransitionCheck =
  | { allowed: true }
  | { allowed: false; reason: 'same_status' | 'stale_event' | 'not_allowed' };

export function checkSubmissionTransition(params: {
  from: string;
  to: string;
  occurredAt?: Date | null;
  lastProviderUpdateAt?: Date | null;
}): TransitionCheck {
  const { from, to, occurredAt, lastProviderUpdateAt } = params;
  // Staleness first: a stale event must not even refresh same-status data.
  if (
    occurredAt &&
    lastProviderUpdateAt &&
    occurredAt.getTime() < lastProviderUpdateAt.getTime()
  ) {
    return { allowed: false, reason: 'stale_event' };
  }
  if (from === to) return { allowed: false, reason: 'same_status' };
  if (!ALLOWED_TRANSITIONS[from]?.has(to)) {
    return { allowed: false, reason: 'not_allowed' };
  }
  return { allowed: true };
}

/**
 * Creator-level kycStatus implied by their latest submission.
 * `fallback` is used when the attempt ended without a decision
 * (abandoned / expired / cancelled): the creator returns to whatever
 * outcome they had before this attempt.
 */
export function kycStatusForSubmission(
  submissionStatus: string,
  fallback: KycStatus,
): KycStatus {
  switch (submissionStatus) {
    case S.CREATED:
    case S.IN_PROGRESS:
    case S.RESUBMISSION_REQUIRED:
      return KycStatus.PENDING;
    case S.NEEDS_REVIEW:
      return KycStatus.NEEDS_REVIEW;
    case S.VERIFIED:
      return KycStatus.VERIFIED;
    case S.REJECTED:
      return KycStatus.REJECTED;
    case S.KYC_EXPIRED:
      return KycStatus.EXPIRED;
    default:
      return fallback;
  }
}

/** Outcome a previous finished submission leaves behind, for fallbacks. */
export function kycStatusFromPriorOutcome(
  status: string | undefined,
): KycStatus {
  switch (status) {
    case S.REJECTED:
      return KycStatus.REJECTED;
    case S.KYC_EXPIRED:
      return KycStatus.EXPIRED;
    default:
      return KycStatus.NOT_SUBMITTED;
  }
}

/** Per-check status fields in the minimized decision summary. */
const CHECK_STATUS_FIELDS: Record<string, string> = {
  ID_VERIFICATION: 'idStatus',
  LIVENESS: 'livenessStatus',
  FACE_MATCH: 'faceMatchStatus',
};

/**
 * Required checks that are not individually Approved in this decision.
 * A provider-level "Approved" is only trusted when this is empty; otherwise
 * the case must go to admin review. Unknown check names count as missing.
 */
export function missingRequiredChecks(
  summary: object | null | undefined,
  required: readonly string[],
): string[] {
  const fields = (summary ?? {}) as Record<string, unknown>;
  return required.filter((check) => {
    const field = CHECK_STATUS_FIELDS[check];
    const status = field ? fields[field] : undefined;
    return (
      typeof status !== 'string' || status.trim().toUpperCase() !== 'APPROVED'
    );
  });
}

/** Creator statuses set by moderation; KYC must never change them. */
export const PROTECTED_CREATOR_STATUSES: ReadonlySet<string> = new Set([
  CreatorStatus.SUSPENDED,
  CreatorStatus.BANNED,
  CreatorStatus.DEACTIVATED,
]);

/** Creator status implied by kycStatus, enforcing ACTIVE => VERIFIED. */
export function creatorStatusForKyc(
  currentStatus: string,
  kycStatus: KycStatus,
): string {
  if (PROTECTED_CREATOR_STATUSES.has(currentStatus)) return currentStatus;

  if (kycStatus === KycStatus.VERIFIED) return CreatorStatus.ACTIVE;

  // Anything not verified must never remain publicly active.
  if (kycStatus === KycStatus.PENDING || kycStatus === KycStatus.NEEDS_REVIEW) {
    return currentStatus === CreatorStatus.REGISTERED
      ? currentStatus
      : CreatorStatus.KYC_PENDING;
  }

  return currentStatus === CreatorStatus.REGISTERED
    ? currentStatus
    : CreatorStatus.PROFILE_CREATED;
}
