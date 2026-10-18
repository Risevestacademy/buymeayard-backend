export const DEFAULT_THANK_YOU_MESSAGE =
  'Thank you so much for your support! It means a lot.';

/** Single source of truth for the thank-you note a supporter sees. */
export function resolveThankYouMessage(stored: string | null | undefined): string {
  return stored?.trim() || DEFAULT_THANK_YOU_MESSAGE;
}