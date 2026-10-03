import type { KycWarning } from '../../infrastructure/kyc/kyc-provider.interface';

/**
 * Maps provider risk codes to messages that are safe to show the creator.
 * Classification is by pattern so unseen codes still land in a sensible
 * bucket. Raw codes are only ever shown to admins.
 *
 * Deliberately vague for fraud signals (duplicates, tampering) so we do not
 * teach bad actors what was detected.
 */
const REASONS = {
  detailsMismatch:
    "The name or date of birth you entered didn't match your document. Check your details and try again.",
  expired: 'Your document has expired. Please use a valid, unexpired document.',
  unreadable:
    "We couldn't read your document clearly. Use good lighting and make sure all details are visible.",
  documentNotAccepted:
    'This document type or country is not accepted. Please use a Nigerian National ID, passport, driver’s licence or voter’s card.',
  age: 'You must be at least 18 years old to verify your identity.',
  face: "We couldn't match your selfie to your document. Remove glasses or face coverings and try again in good lighting.",
  generic:
    "We couldn't verify your identity with the information provided. Please try again with a valid document.",
} as const;

function classify(risk: string): keyof typeof REASONS | null {
  const r = risk.toUpperCase();
  // Fraud signals first: never reveal them specifically.
  if (/DUPLICAT|BLOCKLIST|TAMPER|FRAUD|PUBLIC_DOCUMENT|SCREEN|INJECT/.test(r)) {
    return 'generic';
  }
  if (
    /(NAME|BIRTH|DOB).*(MISMATCH|DIFFERENT|NOT_MATCH)|(MISMATCH|DIFFERENT).*(NAME|BIRTH)/.test(
      r,
    )
  ) {
    return 'detailsMismatch';
  }
  if (/DOCUMENT_EXPIRED/.test(r)) return 'expired';
  if (/AGE/.test(r)) return 'age';
  if (/COUNTRY_NOT_ALLOWED|DOCUMENT_TYPE_NOT_ALLOWED/.test(r)) {
    return 'documentNotAccepted';
  }
  if (/LIVENESS|FACE/.test(r) && !/DOCUMENT_LIVENESS/.test(r)) return 'face';
  if (/RECOGNI|NOT_DETECTED|QUALITY|BLUR|GLARE|DOCUMENT_LIVENESS/.test(r)) {
    return 'unreadable';
  }
  return null;
}

const PRIORITY: Array<keyof typeof REASONS> = [
  'generic', // a fraud signal wins over everything
  'age',
  'documentNotAccepted',
  'expired',
  'detailsMismatch',
  'face',
  'unreadable',
];

export function rejectionReasonFromWarnings(
  warnings: KycWarning[] = [],
): string {
  const buckets = new Set(
    warnings.map((w) => classify(w.risk)).filter((b) => b !== null),
  );
  const match = PRIORITY.find((b) => buckets.has(b));
  return REASONS[match ?? 'generic'];
}
