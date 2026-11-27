import { KycDocumentType, KycSubmissionStatus } from '@buymeayard/types';
import type {
  KycAdminDecisionView,
  KycDecisionSummary,
  KycWarning,
} from '../kyc-provider.interface';

type Json = Record<string, unknown>;

/**
 * Didit status labels -> our submission status, keyed by normalized label.
 * Didit documents labels like "In Review" but some payloads use "IN_REVIEW",
 * so labels are normalized before lookup. Unknown labels map to null and must
 * never cause a state change.
 */
const STATUS_MAP: Record<string, KycSubmissionStatus> = {
  NOT_STARTED: KycSubmissionStatus.CREATED,
  IN_PROGRESS: KycSubmissionStatus.IN_PROGRESS,
  AWAITING_USER: KycSubmissionStatus.IN_PROGRESS,
  IN_REVIEW: KycSubmissionStatus.NEEDS_REVIEW,
  APPROVED: KycSubmissionStatus.VERIFIED,
  DECLINED: KycSubmissionStatus.REJECTED,
  RESUBMITTED: KycSubmissionStatus.RESUBMISSION_REQUIRED,
  ABANDONED: KycSubmissionStatus.ABANDONED,
  EXPIRED: KycSubmissionStatus.EXPIRED,
  KYC_EXPIRED: KycSubmissionStatus.KYC_EXPIRED,
};

export function normalizeDiditStatus(label: unknown): string | null {
  if (typeof label !== 'string' || !label.trim()) return null;
  return label
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

export function mapDiditStatus(label: unknown): KycSubmissionStatus | null {
  const key = normalizeDiditStatus(label);
  return key ? (STATUS_MAP[key] ?? null) : null;
}

/** Our document choice -> Didit `expected_document_types` codes. */
export function toDiditDocumentTypes(
  type?: KycDocumentType | null,
): string[] | undefined {
  if (!type) return undefined;
  switch (type) {
    case KycDocumentType.PASSPORT:
      return ['P'];
    case KycDocumentType.DRIVERS_LICENCE:
      return ['DL'];
    case KycDocumentType.NATIONAL_ID:
    case KycDocumentType.VOTERS_CARD:
      return ['ID']; // Didit classifies NIN cards and voter cards as ID cards
    default:
      return undefined;
  }
}

const FEATURE_ARRAYS = [
  'id_verifications',
  'liveness_checks',
  'face_matches',
] as const;

function asObject(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : null;
}

function first(decision: Json, key: string): Json | null {
  const arr = decision[key];
  return Array.isArray(arr) ? asObject(arr[0]) : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function last4(value: unknown): string | null {
  const s = str(value)?.replace(/[^A-Za-z0-9]/g, '');
  return s ? s.slice(-4) : null;
}

function collectWarnings(decision: Json): KycWarning[] {
  const warnings: KycWarning[] = [];
  for (const key of FEATURE_ARRAYS) {
    const arr = decision[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const list = asObject(item)?.warnings;
      if (!Array.isArray(list)) continue;
      for (const w of list) {
        const risk = str(asObject(w)?.risk);
        if (!risk) continue;
        warnings.push({
          risk,
          feature: str(asObject(w)?.feature) ?? undefined,
          shortDescription: str(asObject(w)?.short_description) ?? undefined,
        });
      }
    }
  }
  return warnings;
}

/**
 * Builds a minimized summary from a Didit decision object. Works for both the
 * webhook `decision` object and the GET /decision/ response (same schema).
 * Uses the plural per-feature arrays; takes the first node of each.
 */
export function summarizeDiditDecision(
  decisionInput: unknown,
): KycDecisionSummary {
  const decision = asObject(decisionInput) ?? {};
  const id = first(decision, 'id_verifications');
  const liveness = first(decision, 'liveness_checks');
  const face = first(decision, 'face_matches');

  return {
    documentType: str(id?.document_type),
    issuingState: str(id?.issuing_state),
    documentNumberLast4:
      last4(id?.document_number) ?? last4(id?.personal_number),
    firstName: str(id?.first_name),
    lastName: str(id?.last_name),
    dateOfBirth: str(id?.date_of_birth),
    idStatus: str(id?.status),
    livenessStatus: str(liveness?.status),
    livenessScore: num(liveness?.score),
    faceMatchStatus: str(face?.status),
    faceMatchScore: num(face?.score),
    warnings: collectWarnings(decision),
  };
}

const ENVELOPE_KEYS = [
  'event_id',
  'webhook_type',
  'timestamp',
  'created_at',
  'environment',
  'session_id',
  'status',
  'workflow_id',
  'workflow_version',
  'vendor_data',
  'trigger',
  'sandbox_scenario',
] as const;

/**
 * Keeps only the webhook envelope plus per-feature statuses and risk codes.
 * Drops media URLs, names, document numbers and any other PII.
 */
export function redactDiditWebhook(payload: Json): Json {
  const redacted: Json = {};
  for (const key of ENVELOPE_KEYS) {
    if (key in payload) redacted[key] = payload[key];
  }

  const decision = asObject(payload.decision);
  if (decision) {
    const features: Json = {};
    for (const key of FEATURE_ARRAYS) {
      const arr = decision[key];
      if (!Array.isArray(arr)) continue;
      features[key] = arr.map((item) => ({
        node_id: str(asObject(item)?.node_id),
        status: str(asObject(item)?.status),
      }));
    }
    redacted.decision = {
      status: str(decision.status),
      ...features,
      warnings: collectWarnings(decision).map((w) => w.risk),
    };
  }

  const resubmit = asObject(payload.resubmit_info);
  if (resubmit) {
    redacted.resubmit_info = { nodes_to_resubmit: resubmit.nodes_to_resubmit };
  }

  return redacted;
}

export function emptyAdminDecisionView(): KycAdminDecisionView {
  return {
    status: null,
    idVerification: null,
    liveness: null,
    faceMatch: null,
    warnings: [],
  };
}

/**
 * Admin detail view of a Didit decision: an explicit allowlist of fields.
 * Only these fields are copied; everything else in the payload is dropped.
 */
export function toAdminDecisionView(
  decisionInput: unknown,
): KycAdminDecisionView {
  const decision = asObject(decisionInput) ?? {};
  const id = first(decision, 'id_verifications');
  const liveness = first(decision, 'liveness_checks');
  const face = first(decision, 'face_matches');

  return {
    status: str(decision.status),
    idVerification: id
      ? {
          status: str(id.status),
          documentType: str(id.document_type),
          documentNumberLast4:
            last4(id.document_number) ?? last4(id.personal_number),
          firstName: str(id.first_name),
          lastName: str(id.last_name),
          dateOfBirth: str(id.date_of_birth),
          expirationDate: str(id.expiration_date),
          issuingState: str(id.issuing_state),
          nationality: str(id.nationality),
          images: {
            front: str(id.front_image),
            back: str(id.back_image),
            portrait: str(id.portrait_image),
          },
        }
      : null,
    liveness: liveness
      ? {
          status: str(liveness.status),
          method: str(liveness.method),
          score: num(liveness.score),
          referenceImage: str(liveness.reference_image),
        }
      : null,
    faceMatch: face
      ? {
          status: str(face.status),
          score: num(face.score),
          sourceImage: str(face.source_image),
          targetImage: str(face.target_image),
        }
      : null,
    warnings: collectWarnings(decision),
  };
}
