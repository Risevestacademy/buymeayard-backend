import {
  CreatorStatus,
  KycDocumentType,
  KycStatus,
  KycSubmissionStatus,
} from './enums';

/** Body of POST /api/v1/creators/me/kyc/session */
export interface StartKycSessionRequest {
  firstName: string;
  lastName: string;
  /** ISO date, YYYY-MM-DD */
  dateOfBirth: string;
  /** ISO 3166-1 alpha-3. Only 'NGA' is supported for now. */
  country: string;
  documentType: KycDocumentType;
}

/** Response of POST /api/v1/creators/me/kyc/session */
export interface StartKycSessionResponse {
  submissionId: string;
  status: KycSubmissionStatus;
  /** Hosted flow URL for the web SDK / iframe / redirect. */
  verificationUrl: string;
  /** Token for the native (React Native) SDK. */
  sessionToken: string;
  /** True when an unfinished session was returned instead of a new one. */
  resumed: boolean;
}

/** Response of GET /api/v1/creators/me/kyc */
export interface KycStatusResponse {
  kycStatus: KycStatus;
  creatorStatus: CreatorStatus;
  contributionsEnabled: boolean;
  canStartSession: boolean;
  prefill: {
    firstName: string | null;
    lastName: string | null;
  };
  latestSubmission: {
    id: string;
    status: KycSubmissionStatus;
    documentType: KycDocumentType | null;
    createdAt: string;
    completedAt: string | null;
    /** Safe to show to the creator. */
    rejectionReason: string | null;
  } | null;
}
