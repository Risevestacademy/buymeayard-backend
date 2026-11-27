export const ANONYMOUS_LABEL = 'Anonymous';

/**
 * PUBLIC: name and message on the contribution wall and the creator dashboard.
 * CREATOR_ONLY: hidden on the wall, shown on the creator dashboard.
 * ANONYMOUS: hidden on both.
 */
export const SUPPORT_VISIBILITIES = [
  'PUBLIC',
  'CREATOR_ONLY',
  'ANONYMOUS',
] as const;
export type SupportVisibility = (typeof SUPPORT_VISIBILITIES)[number];

interface NameSource {
  visibility: string;
  guestName: string | null;
}

function nameOrAnonymous(guestName: string | null): string {
  return guestName?.trim() || ANONYMOUS_LABEL;
}

/** Name shown on the public contribution wall. */
export function resolveDisplayName(row: NameSource): string {
  return row.visibility === 'PUBLIC'
    ? nameOrAnonymous(row.guestName)
    : ANONYMOUS_LABEL;
}

/** Message shown on the public wall. */
export function wallMessage(row: {
  visibility: string;
  message: string | null;
}): string | null {
  return row.visibility === 'PUBLIC' ? row.message || null : null;
}

/** Message shown to the creator who received the gift. */
export function creatorMessage(row: {
  visibility: string;
  message: string | null;
}): string | null {
  return row.visibility === 'ANONYMOUS' ? null : row.message || null;
}
