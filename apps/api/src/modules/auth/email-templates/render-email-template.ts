import { readFileSync } from 'fs';
import { join } from 'path';

export type EmailTemplateName = 'verify-email' | 'reset-password' | 'welcome';

const cache = new Map<EmailTemplateName, string>();

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Renders an HTML email from the templates in this folder, replacing `{{key}}`
 * placeholders. Values are HTML-escaped (so URLs have `&` encoded as `&amp;`,
 * which is correct inside href attributes).
 */
export function renderEmailTemplate(
  name: EmailTemplateName,
  vars: Record<string, string>,
): string {
  let html = cache.get(name);
  if (!html) {
    html = readFileSync(join(__dirname, `${name}.html`), 'utf8');
    cache.set(name, html);
  }
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) =>
    escapeHtml(vars[key] ?? ''),
  );
}
