import type { IncomingHttpHeaders } from 'http';
import { KycDocumentType, KycSubmissionStatus } from '@buymeayard/types';

export const KYC_PROVIDER = 'KYC_PROVIDER';

export interface KycExpectedDetails {
  firstName: string;
  lastName: string;
  dateOfBirth: string; // YYYY-MM-DD
  country: string; // ISO 3166-1 alpha-3
  documentType: KycDocumentType;
}

export interface CreateKycSessionParams {
  vendorData: string; // Our creator profile ID
  callbackUrl: string;
  email?: string;
  expectedDetails: KycExpectedDetails;
  metadata?: Record<string, string | number | boolean>;
}

export interface KycSessionResult {
  sessionId: string;
  url: string;
  sessionToken: string;
  providerStatus: string;
  status: KycSubmissionStatus | null;
  workflowId?: string;
}

export interface KycWarning {
  risk: string;
  feature?: string;
  shortDescription?: string;
}

/** Minimized decision. Never contains images, media URLs or full ID numbers. */
export interface KycDecisionSummary {
  documentType: string | null;
  issuingState: string | null;
  documentNumberLast4: string | null;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  idStatus: string | null;
  livenessStatus: string | null;
  livenessScore: number | null;
  faceMatchStatus: string | null;
  faceMatchScore: number | null;
  warnings: KycWarning[];
  /** Set by our policy when a provider approval lacked required checks. */
  missingRequiredChecks?: string[];
}

export interface KycDecision {
  providerStatus: string;
  status: KycSubmissionStatus | null;
  summary: KycDecisionSummary;
  /** Allowlisted view for the admin detail screen. Never persist. */
  adminView: KycAdminDecisionView;
}

/**
 * What an admin reviewer sees. An explicit allowlist: anything not listed
 * here (addresses, MRZ, barcodes, full document numbers, ...) never leaves
 * the provider layer. Image URLs are short-lived presigned links.
 */
export interface KycAdminDecisionView {
  status: string | null;
  idVerification: {
    status: string | null;
    documentType: string | null;
    documentNumberLast4: string | null;
    firstName: string | null;
    lastName: string | null;
    dateOfBirth: string | null;
    expirationDate: string | null;
    issuingState: string | null;
    nationality: string | null;
    images: {
      front: string | null;
      back: string | null;
      portrait: string | null;
    };
  } | null;
  liveness: {
    status: string | null;
    method: string | null;
    score: number | null;
    referenceImage: string | null;
  } | null;
  faceMatch: {
    status: string | null;
    score: number | null;
    sourceImage: string | null;
    targetImage: string | null;
  } | null;
  warnings: KycWarning[];
}

export interface KycWebhookEvent {
  eventId: string;
  eventType: string;
  sessionId: string | null;
  vendorData: string | null;
  providerStatus: string | null;
  status: KycSubmissionStatus | null;
  environment: string | null;
  workflowId: string | null;
  occurredAt: Date | null;
  summary: KycDecisionSummary | null;
  /** Envelope with decision media and PII stripped, safe to store. */
  redactedPayload: Record<string, unknown>;
}

export type KycWebhookVerification =
  | { isValid: true; event: KycWebhookEvent }
  | { isValid: false; reason: string };

export type KycManualDecision = 'APPROVED' | 'DECLINED';

export interface KycProvider {
  readonly providerName: string;
  createSession(params: CreateKycSessionParams): Promise<KycSessionResult>;
  deleteSession(sessionId: string): Promise<void>;
  getDecision(sessionId: string): Promise<KycDecision>;
  updateStatus(
    sessionId: string,
    decision: KycManualDecision,
    comment: string,
  ): Promise<void>;
  verifyWebhook(
    headers: IncomingHttpHeaders,
    rawBody: Buffer | undefined,
  ): KycWebhookVerification;
}
