export const ANONYMOUS_LABEL = 'Anonymous';

interface NameSource {
  isAnonymous: boolean;
  guestName: string | null;
  supporter: { name: string | null } | null;
}

/** Single source of truth for the name shown on public and creator-facing views. */
export function resolveDisplayName(row: NameSource): string {
  if (row.isAnonymous) return ANONYMOUS_LABEL;
  const name = (row.guestName || row.supporter?.name)?.trim();
  return name || ANONYMOUS_LABEL;
}
