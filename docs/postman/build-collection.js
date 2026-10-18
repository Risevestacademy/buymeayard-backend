/* Builds the Postman collection + environment. Run from the repo root: node docs/postman/build-collection.js docs/postman */
const fs = require('fs');
const path = require('path');

const outDir = process.argv[2];
const lines = (s) => s.replace(/^\n/, '').replace(/\s+$/, '').split('\n');

// ---------------------------------------------------------------------------
// Script snippets
// ---------------------------------------------------------------------------
const status = (code) => `
pm.test('Status is ${code}', () => pm.response.to.have.status(${code}));`;

const errorCode = (code) => `
pm.test('Error code is ${code}', () => {
  pm.expect(pm.response.json().error.code).to.eql('${code}');
});`;

const statusIn = (codes) => `
pm.test('Status is one of ${codes.join('/')}', () => {
  pm.expect(pm.response.code).to.be.oneOf([${codes.join(', ')}]);
});`;

const set = (name, expr) => `pm.collectionVariables.set('${name}', ${expr});`;

const saveToken = (who) => `
${status(200).trim()}
const json = pm.response.json();
const token = (json.data && json.data.token) || pm.response.headers.get('set-auth-token');
pm.test('Session token returned (mobile mode)', () => pm.expect(token).to.be.a('string').and.not.empty);
${set(`${who}Token`, 'token')}
${set(`${who}UserId`, 'json.data.user.id')}`;

// Skips the request (instead of sending it) when a manually-pasted value is missing.
const skipIfMissing = (name, hint) => `
if (!pm.variables.get('${name}')) {
  console.warn('Skipped: {{${name}}} is empty. ${hint}');
  pm.execution.skipRequest();
}`;

const needVar = (name, hint) => `
if (!pm.variables.get('${name}')) {
  throw new Error('{{${name}}} is empty. ${hint}');
}`;

// Signs a Didit webhook exactly like Didit does (X-Signature = HMAC-SHA256 of
// the raw body). newSession=true starts a fresh provider session id, which the
// API "adopts" as a new submission because vendor_data + workflow_id match.
const diditPre = (diditStatus, { newSession = false, decision = null } = {}) => `
${needVar('creatorId', 'Run the onboarding request first.').trim()}
${needVar('diditWebhookSecret', 'Set it to the same value as DIDIT_WEBHOOK_SECRET in apps/api/.env.').trim()}
${needVar('diditWorkflowId', 'Set it to the same value as DIDIT_WORKFLOW_ID in apps/api/.env.').trim()}

let sessionId = pm.collectionVariables.get('diditSessionId');
if (${newSession} || !sessionId) {
  sessionId = pm.variables.replaceIn('{{$guid}}');
  pm.collectionVariables.set('diditSessionId', sessionId);
}
const now = Math.floor(Date.now() / 1000);
const payload = {
  event_id: pm.variables.replaceIn('{{$guid}}'),
  webhook_type: 'status.updated',
  session_id: sessionId,
  status: '${diditStatus}',
  vendor_data: pm.variables.get('creatorId'),
  workflow_id: pm.variables.get('diditWorkflowId'),
  environment: 'sandbox',
  created_at: now,
  timestamp: now${decision ? `,\n  decision: ${JSON.stringify(decision, null, 2).replace(/\n/g, '\n  ')}` : ''}
};
const body = JSON.stringify(payload);
pm.collectionVariables.set('diditBody', body);
pm.collectionVariables.set('diditTimestamp', String(now));
pm.collectionVariables.set(
  'diditSignature',
  CryptoJS.HmacSHA256(body, pm.variables.get('diditWebhookSecret')).toString(CryptoJS.enc.Hex)
);`;

const approvedDecision = {
  status: 'Approved',
  id_verifications: [
    {
      node_id: 'feature_ocr',
      status: 'Approved',
      document_type: 'Identity Card',
      document_number: 'NIN-12345678',
      issuing_state: 'NGA',
      first_name: 'Test',
      last_name: 'Creator',
      date_of_birth: '1995-10-12',
      warnings: [],
    },
  ],
  liveness_checks: [{ node_id: 'feature_liveness', status: 'Approved', score: 97.5 }],
  face_matches: [{ node_id: 'feature_face', status: 'Approved', score: 91 }],
};

const declinedDecision = {
  status: 'Declined',
  id_verifications: [
    {
      node_id: 'feature_ocr',
      status: 'Declined',
      document_type: 'Identity Card',
      issuing_state: 'NGA',
      warnings: [{ risk: 'DOCUMENT_EXPIRED', feature: 'ID_VERIFICATION', short_description: 'Document expired' }],
    },
  ],
  liveness_checks: [{ node_id: 'feature_liveness', status: 'Approved', score: 95 }],
  face_matches: [{ node_id: 'feature_face', status: 'Approved', score: 88 }],
};

const diditHeaders = (sig = '{{diditSignature}}') => [
  { key: 'Content-Type', value: 'application/json' },
  { key: 'X-Timestamp', value: '{{diditTimestamp}}' },
  { key: 'X-Signature', value: sig },
];

const paystackPre = `
${needVar('paymentReference', 'Run "Initialize payment" first.').trim()}
const body = JSON.stringify({
  event: 'charge.success',
  data: {
    id: Math.floor(Math.random() * 1e9),
    reference: pm.variables.get('paymentReference'),
    amount: Number(pm.variables.get('supportTotal')),
    currency: 'NGN',
    status: 'success',
    paid_at: new Date().toISOString(),
    channel: 'card',
    customer: { email: pm.variables.get('supporterEmail') }
  }
});
pm.collectionVariables.set('paystackBody', body);
pm.collectionVariables.set(
  'paystackSignature',
  CryptoJS.HmacSHA512(body, pm.variables.get('paystackWebhookSecret')).toString(CryptoJS.enc.Hex)
);`;

const paystackHeaders = (sig = '{{paystackSignature}}') => [
  { key: 'Content-Type', value: 'application/json' },
  { key: 'x-paystack-signature', value: sig },
];

const kycStatusTest = (kyc, contributions) => `
${status(200).trim()}
const d = pm.response.json().data;
pm.test('kycStatus is ${kyc}', () => pm.expect(d.kycStatus).to.eql('${kyc}'));
pm.test('contributionsEnabled is ${contributions}', () => pm.expect(d.contributionsEnabled).to.eql(${contributions}));
console.log('KYC status', JSON.stringify(d, null, 2));`;

// ---------------------------------------------------------------------------
// Request builder
// ---------------------------------------------------------------------------
const AUTH = {
  creator: '{{creatorToken}}',
  supporter: '{{supporterToken}}',
  admin: '{{adminToken}}',
};

function req(name, method, urlPath, opts = {}) {
  const {
    as = 'none',
    body,
    rawBody,
    headers = [],
    desc = '',
    pre,
    test,
    host = false,
  } = opts;
  const base = host ? '{{hostUrl}}' : '{{baseUrl}}';
  const request = {
    method,
    header: [{ key: 'x-client-type', value: 'mobile', description: 'Mobile mode: session token is returned in JSON instead of a cookie' }, ...headers],
    url: `${base}${urlPath}`,
    description: desc.trim(),
    auth:
      as === 'none'
        ? { type: 'noauth' }
        : { type: 'bearer', bearer: [{ key: 'token', value: AUTH[as], type: 'string' }] },
  };
  if (body !== undefined || rawBody !== undefined) {
    request.body = {
      mode: 'raw',
      raw: rawBody !== undefined ? rawBody : JSON.stringify(body, null, 2),
      options: { raw: { language: 'json' } },
    };
    if (!headers.some((h) => h.key.toLowerCase() === 'content-type')) {
      request.header.push({ key: 'Content-Type', value: 'application/json' });
    }
  }
  const event = [];
  if (pre) event.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: lines(pre) } });
  if (test) event.push({ listen: 'test', script: { type: 'text/javascript', exec: lines(test) } });
  return { name, event, request };
}

const folder = (name, description, item) => ({ name, description: description.trim(), item });

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------
const f00 = folder(
  '00 · Setup',
  `
Start every run here. **Start new test run** generates a unique run id so the creator and
supporter emails/usernames never collide with a previous run.

Before running: \`pnpm db:up\`, \`pnpm db:migrate\`, seed roles/admin
(\`cd apps/api && pnpm prisma db seed\`), seed the catalogue
(\`docs/postman/sql/01-seed-catalogue.sql\`), then \`pnpm dev\`.
`,
  [
    req('Start new test run (health check)', 'GET', '/health', {
      host: true,
      desc: `
Generates fresh test identities and checks the API and database are up.

\`/health\` is outside the \`/api/v1\` prefix, so it uses \`{{hostUrl}}\`.
Clears every runtime variable from a previous run (tokens, ids, references).`,
      pre: `
const keep = new Set(['baseUrl', 'hostUrl', 'adminEmail', 'adminPassword', 'testPassword',
  'paystackWebhookSecret', 'diditWebhookSecret', 'diditWorkflowId']);
pm.collectionVariables.toObject && Object.keys(pm.collectionVariables.toObject()).forEach((k) => {
  if (!keep.has(k)) pm.collectionVariables.unset(k);
});
const runId = Date.now().toString(36);
${set('runId', 'runId')}
${set('creatorEmail', '`creator+${runId}@example.com`')}
${set('creatorSlug', '`creator_${runId}`')}
${set('supporterEmail', '`supporter+${runId}@example.com`')}
console.log('New run', runId);`,
      test: `
${status(200).trim()}
pm.test('Database is up', () => pm.expect(pm.response.json().data.info.database.status).to.eql('up'));`,
    }),
    req('Materials catalogue (verify seed)', 'GET', '/materials', {
      desc: `
Public. Lists ACTIVE catalogue materials. If this is empty, run
\`docs/postman/sql/01-seed-catalogue.sql\` first.`,
      test: `
${status(200).trim()}
const items = pm.response.json().data;
pm.test('Catalogue is seeded', () => pm.expect(items.length).to.be.greaterThan(0));
const ankara = items.find((m) => m.slug === 'ankara');
if (ankara) ${set('materialSlug', 'ankara.slug')}`,
    }),
    req('Material by slug', 'GET', '/materials/{{materialSlug}}', {
      test: `
${status(200).trim()}
pm.test('Slug matches', () => pm.expect(pm.response.json().data.slug).to.eql(pm.variables.get('materialSlug')));`,
    }),
    req('Material by slug (unknown → 404)', 'GET', '/materials/does-not-exist', {
      test: status(404),
    }),
  ],
);

const f01 = folder(
  '01 · Auth — Creator account',
  `
Registration, login and password flows via Better Auth.

All requests send \`x-client-type: mobile\`, so the session token comes back in
\`data.token\` and is saved as \`{{creatorToken}}\`. Web clients get an HTTP-only
cookie instead; both work against every endpoint.`,
  [
    req('Register creator', 'POST', '/auth/register', {
      body: { email: '{{creatorEmail}}', password: '{{testPassword}}' },
      desc: `
Creates a user and signs them in. Only \`email\` and \`password\` are accepted
(unknown fields are rejected with 400). No role is assigned yet; the CREATOR role
is granted by onboarding.`,
      test: `
${saveToken('creator').replace('have.status(200)', 'have.status(201)').replace("Status is 200", "Status is 201")}
pm.test('Not onboarded yet', () => pm.expect(json.data.isOnboardingCompleted).to.eql(false));`,
    }),
    req('Register creator again (duplicate → 4xx)', 'POST', '/auth/register', {
      body: { email: '{{creatorEmail}}', password: '{{testPassword}}' },
      test: `
pm.test('Duplicate email is rejected', () => pm.expect(pm.response.code).to.be.within(400, 499));`,
    }),
    req('Register with extra field (→ 400)', 'POST', '/auth/register', {
      body: { email: 'extra+{{runId}}@example.com', password: '{{testPassword}}', role: 'ADMIN' },
      desc: 'The global ValidationPipe uses forbidNonWhitelisted; privilege fields cannot be smuggled in.',
      test: status(400),
    }),
    req('Register with short password (→ 400)', 'POST', '/auth/register', {
      body: { email: 'short+{{runId}}@example.com', password: 'short' },
      test: status(400),
    }),
    req('Login creator', 'POST', '/auth/login', {
      body: { email: '{{creatorEmail}}', password: '{{testPassword}}' },
      test: saveToken('creator'),
    }),
    req('Login with wrong password (→ 401)', 'POST', '/auth/login', {
      body: { email: '{{creatorEmail}}', password: 'WrongPassword123!' },
      test: status(401),
    }),
    req('Get session', 'GET', '/auth/session', {
      as: 'creator',
      test: `
${status(200).trim()}
pm.test('Session belongs to creator', () => pm.expect(pm.response.json().data.user.email).to.eql(pm.variables.get('creatorEmail')));`,
    }),
    req('Get session without token (→ null session)', 'GET', '/auth/session', {
      desc: 'Public route: returns `data: null` rather than 401 when there is no session.',
      test: `
${status(200).trim()}
pm.test('No session', () => pm.expect(pm.response.json().data).to.be.null);`,
    }),
    req('Resend verification email', 'POST', '/auth/send-verification-email', {
      as: 'creator',
      desc: 'Needs BREVO_API_KEY or SMTP_* configured to actually deliver. Returns 200 either way.',
      test: status(200),
    }),
    req('Verify email (token from email)', 'POST', '/auth/verify-email', {
      body: { token: '{{emailVerificationToken}}' },
      desc: `
Paste the \`token\` query param from the verification email link into
\`{{emailVerificationToken}}\`. The token is a signed JWT that exists only in the email,
so this step needs a working email provider. Skip it otherwise: login does not require
a verified email.`,
      pre: skipIfMissing('emailVerificationToken', 'Paste the token from the verification email, or skip this request.'),
      test: status(200),
    }),
    req('Forgot password', 'POST', '/auth/forgot-password', {
      body: { email: '{{creatorEmail}}' },
      desc: `
Sends a reset link. Without an email provider, read the token from the database:

\`\`\`sql
SELECT replace(identifier, 'reset-password:', '') AS token
FROM verifications WHERE identifier LIKE 'reset-password:%'
ORDER BY "createdAt" DESC LIMIT 1;
\`\`\`

Then set \`{{passwordResetToken}}\`.`,
      test: status(200),
    }),
    req('Reset password (token from email)', 'POST', '/auth/reset-password', {
      body: { token: '{{passwordResetToken}}', newPassword: '{{testPassword}}' },
      desc: 'Resets to the same `{{testPassword}}` so later requests keep working.',
      pre: skipIfMissing('passwordResetToken', 'See the "Forgot password" description for how to get it, or skip this request.'),
      test: status(200),
    }),
    req('Change password (wrong current → 400)', 'POST', '/auth/change-password', {
      as: 'creator',
      body: { currentPassword: 'NotMyPassword123!', newPassword: 'AnotherP@ss123' },
      test: statusIn([400, 401]),
    }),
    req('Change password (round trip)', 'POST', '/auth/change-password', {
      as: 'creator',
      body: { currentPassword: '{{testPassword}}', newPassword: '{{testPassword}}' },
      desc: 'Changes the password to itself so the rest of the run is unaffected.',
      test: status(200),
    }),
  ],
);

const f02 = folder(
  '02 · Creator onboarding & profile',
  `
Onboarding creates the CreatorProfile (status PROFILE_CREATED, kycStatus NOT_SUBMITTED)
and grants the CREATOR role.

**When this folder finishes, run the fixtures SQL before folder 03** — the exact command is
printed in the Postman console by "Complete onboarding". It adds the creator's yard menu,
a payout method and posts, none of which have endpoints yet.`,
  [
    req('Get my user (before onboarding)', 'GET', '/users/me', {
      as: 'creator',
      test: `
${status(200).trim()}
const d = pm.response.json().data;
pm.test('Not onboarded', () => pm.expect(d.isOnboardingCompleted).to.eql(false));
pm.test('No roles yet', () => pm.expect(d.roles).to.eql([]));`,
    }),
    req('Get my creator profile (before onboarding → 404)', 'GET', '/creators/me', {
      as: 'creator',
      test: status(404),
    }),
    req('KYC status before onboarding (→ 403, no CREATOR role)', 'GET', '/creators/me/kyc', {
      as: 'creator',
      test: status(403),
    }),
    req('Onboarding with invalid slug (→ 400)', 'PUT', '/creators/me/onboarding', {
      as: 'creator',
      body: { creatorName: 'Test Creator', slug: 'bad link!' },
      test: status(400),
    }),
    req('Onboarding without name (→ 400)', 'PUT', '/creators/me/onboarding', {
      as: 'creator',
      body: { slug: '{{creatorSlug}}' },
      test: status(400),
    }),
    req('Complete onboarding', 'PUT', '/creators/me/onboarding', {
      as: 'creator',
      body: {
        creatorName: 'Test Creator',
        slug: '{{creatorSlug}}',
        socialLinks: [
          { platform: 'twitter', url: 'https://x.com/{{creatorSlug}}' },
          { platform: 'instagram', url: 'https://instagram.com/{{creatorSlug}}' },
        ],
      },
      desc: `
Accepts \`creatorName\` and \`slug\` (3–30 characters: lowercase letters, digits,
\`_\` or \`-\`; reserved words are refused). The public page is \`/creators/<slug>\`.`,
      test: `
${status(200).trim()}
const d = pm.response.json().data;
pm.test('Status PROFILE_CREATED', () => pm.expect(d.status).to.eql('PROFILE_CREATED'));
pm.test('kycStatus NOT_SUBMITTED', () => pm.expect(d.kycStatus).to.eql('NOT_SUBMITTED'));
pm.test('Two social links', () => pm.expect(d.socialLinks.length).to.eql(2));
${set('creatorId', 'd.id')}
${set('creatorSlug', 'd.slug')}
console.log('\\n>>> NOW RUN (from the repo root):\\n' +
  'docker exec -i buymeayard-postgres psql -U postgres -d buymeayard -v creator=' + d.slug +
  ' < docs/postman/sql/02-seed-creator-fixtures.sql\\n');`,
    }),
    req('Re-run onboarding (idempotent update)', 'PUT', '/creators/me/onboarding', {
      as: 'creator',
      body: { creatorName: 'Test Creator', slug: '{{creatorSlug}}' },
      desc: 'Re-onboarding with the same slug updates the profile instead of failing.',
      test: `
${status(200).trim()}
pm.test('Same profile id', () => pm.expect(pm.response.json().data.id).to.eql(pm.variables.get('creatorId')));`,
    }),
    req('Get my creator profile', 'GET', '/creators/me', {
      as: 'creator',
      test: `
${status(200).trim()}
pm.test('Profile matches', () => pm.expect(pm.response.json().data.id).to.eql(pm.variables.get('creatorId')));`,
    }),
    req('Get my user (after onboarding)', 'GET', '/users/me', {
      as: 'creator',
      test: `
${status(200).trim()}
const d = pm.response.json().data;
pm.test('Onboarded', () => pm.expect(d.isOnboardingCompleted).to.eql(true));
pm.test('Has CREATOR role', () => pm.expect(d.roles).to.include('CREATOR'));`,
    }),
    req('Update my user', 'PATCH', '/users/me', {
      as: 'creator',
      body: { name: 'Test Creator', image: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' },
      test: `
${status(200).trim()}
pm.test('Image updated', () => pm.expect(pm.response.json().data.image).to.include('cloudinary'));`,
    }),
    req('Update my user with invalid image (→ 400)', 'PATCH', '/users/me', {
      as: 'creator',
      body: { image: 'not-a-url' },
      test: status(400),
    }),
    req('Public creator profile via buymeayard/ prefix', 'GET', '/creators/buymeayard%2F{{creatorSlug}}', {
      desc: 'A pasted `buymeayard/<slug>` link (URL-encoded) is cleaned to the slug and resolves to the same creator.',
      test: `
${status(200).trim()}
pm.test('Same creator', () => pm.expect(pm.response.json().data.id).to.eql(pm.variables.get('creatorId')));`,
    }),
    req('Discover creators (not listed before KYC)', 'GET', '/creators?search={{creatorSlug}}', {
      desc: 'Discovery only lists ACTIVE creators. An unverified creator must not appear.',
      test: `
${status(200).trim()}
pm.test('Unverified creator is hidden', () => pm.expect(pm.response.json().data.length).to.eql(0));`,
    }),
    req('Unknown creator (→ 404)', 'GET', '/creators/no_such_creator_xyz', { test: status(404) }),
  ],
);

const f03 = folder(
  '03 · Creator fixtures, supporter & admin',
  `
**Run \`docs/postman/sql/02-seed-creator-fixtures.sql\` before this folder** (the command is
printed in the Postman console by "Complete onboarding"). The first request fails if it
has not been run.

The supporter is any signed-in user who is not the creator. The admin is the
seeded super admin (\`admin@buymeayard.com\`).`,
  [
    req('Public creator profile (after SQL fixtures)', 'GET', '/creators/{{creatorSlug}}', {
      desc: `
Public. Run \`02-seed-creator-fixtures.sql\` before this request. Saves the cheapest
ACTIVE material as \`{{creatorMaterialId}}\` and the INACTIVE one as
\`{{inactiveCreatorMaterialId}}\`.`,
      test: `
${status(200).trim()}
const d = pm.response.json().data;
const active = d.materials.filter((m) => m.status === 'ACTIVE').sort((a, b) => a.price - b.price);
const inactive = d.materials.find((m) => m.status === 'INACTIVE');
pm.test('Yard menu seeded (run 02-seed-creator-fixtures.sql if this fails)', () => pm.expect(active.length).to.be.greaterThan(0));
if (active[0]) {
  ${set('creatorMaterialId', 'active[0].id')}
  ${set('creatorMaterialPrice', 'String(active[0].price)')}
}
if (active[1]) ${set('creatorMaterialId2', 'active[1].id')}
if (inactive) ${set('inactiveCreatorMaterialId', 'inactive.id')}`,
    }),
    req('My yard menu (creator)', 'GET', '/creators/me/materials', {
      as: 'creator',
      desc: 'The creator\'s own menu: ACTIVE items only, with custom prices and the catalogue material.',
      test: `
${status(200).trim()}
const items = pm.response.json().data;
pm.test('Returns the seeded menu', () => pm.expect(items.length).to.be.greaterThan(0));
pm.test('Only ACTIVE items', () => pm.expect(items.every((m) => m.status === 'ACTIVE')).to.eql(true));
pm.test('Includes the catalogue material', () => pm.expect(items[0].material).to.have.property('slug'));`,
    }),
    req('Register supporter', 'POST', '/auth/register', {
      body: { email: '{{supporterEmail}}', password: '{{testPassword}}' },
      test: saveToken('supporter').replace('have.status(200)', 'have.status(201)').replace('Status is 200', 'Status is 201'),
    }),
    req('Login admin', 'POST', '/auth/login', {
      body: { email: '{{adminEmail}}', password: '{{adminPassword}}' },
      desc: 'Seeded by `pnpm prisma db seed`.',
      test: saveToken('admin'),
    }),
    req('Admin user has admin roles', 'GET', '/users/me', {
      as: 'admin',
      test: `
${status(200).trim()}
pm.test('SUPER_ADMIN role', () => pm.expect(pm.response.json().data.roles).to.include('SUPER_ADMIN'));`,
    }),
    req('Supporter views creator user (public view)', 'GET', '/users/{{creatorUserId}}', {
      as: 'supporter',
      test: `
${status(200).trim()}
pm.test('Email is hidden from other users', () => pm.expect(pm.response.json().data).to.not.have.property('email'));`,
    }),
    req('Admin views creator user (full view)', 'GET', '/users/{{creatorUserId}}', {
      as: 'admin',
      test: `
${status(200).trim()}
pm.test('Admin sees email', () => pm.expect(pm.response.json().data.email).to.eql(pm.variables.get('creatorEmail')));`,
    }),
    req('Protected route without token (→ 401)', 'GET', '/users/me', { test: status(401) }),
    req('Supporter hits admin route (→ 403)', 'GET', '/admin/summary', { as: 'supporter', test: status(403) }),
    req('Supporter hits creator KYC route (→ 403)', 'GET', '/creators/me/kyc', { as: 'supporter', test: status(403) }),
  ],
);

const f04 = folder(
  '04 · Gates before KYC (negative)',
  `
A creator who is not verified cannot receive money or withdraw it.
Every request here must fail.`,
  [
    req('Supporter creates support (→ 403 CREATOR_NOT_ACTIVE)', 'POST', '/supports', {
      as: 'supporter',
      body: { creatorId: '{{creatorId}}', items: [{ creatorMaterialId: '{{creatorMaterialId}}', quantity: 1 }] },
      test: status(403) + errorCode('CREATOR_NOT_ACTIVE'),
    }),
    req('Creator balance is zero', 'GET', '/creators/me/balance', {
      as: 'creator',
      test: `
${status(200).trim()}
pm.test('Balance is 0', () => pm.expect(pm.response.json().data.availableBalance).to.eql(0));`,
    }),
    req('Creator requests payout (→ 400 KYC_REQUIRED)', 'POST', '/creators/me/payouts', {
      as: 'creator',
      body: { amount: 1000 },
      test: status(400) + errorCode('KYC_REQUIRED'),
    }),
  ],
);

const f05 = folder(
  '05 · KYC — Creator starts verification',
  `
\`POST /creators/me/kyc/session\` calls Didit. It only succeeds with real Didit
**sandbox** credentials (\`DIDIT_API_KEY\` + \`DIDIT_WORKFLOW_ID\`). Without them it
returns 503 \`KYC_PROVIDER_ERROR\` — that is expected; continue with folder 06,
which simulates Didit's webhooks.`,
  [
    req('Get my KYC status (initial)', 'GET', '/creators/me/kyc', {
      as: 'creator',
      test: `
${kycStatusTest('NOT_SUBMITTED', false).trim()}
pm.test('Can start a session', () => pm.expect(d.canStartSession).to.eql(true));
pm.test('Prefill from profile name', () => pm.expect(d.prefill.firstName).to.eql('Test'));`,
    }),
    req('Start session: under 18 (→ 400)', 'POST', '/creators/me/kyc/session', {
      as: 'creator',
      pre: `
const d = new Date(); d.setFullYear(d.getFullYear() - 16);
pm.variables.set('minorDob', d.toISOString().slice(0, 10));`,
      rawBody: JSON.stringify({ firstName: 'Test', lastName: 'Creator', dateOfBirth: '{{minorDob}}', country: 'NGA', documentType: 'NATIONAL_ID' }, null, 2),
      test: status(400),
    }),
    req('Start session: impossible date (→ 400)', 'POST', '/creators/me/kyc/session', {
      as: 'creator',
      body: { firstName: 'Test', lastName: 'Creator', dateOfBirth: '1995-02-30', country: 'NGA', documentType: 'NATIONAL_ID' },
      test: status(400),
    }),
    req('Start session: unsupported country (→ 400)', 'POST', '/creators/me/kyc/session', {
      as: 'creator',
      body: { firstName: 'Test', lastName: 'Creator', dateOfBirth: '1995-10-12', country: 'GHA', documentType: 'NATIONAL_ID' },
      test: status(400),
    }),
    req('Start session: bad document type (→ 400)', 'POST', '/creators/me/kyc/session', {
      as: 'creator',
      body: { firstName: 'Test', lastName: 'Creator', dateOfBirth: '1995-10-12', country: 'NGA', documentType: 'BIRTH_CERT' },
      test: status(400),
    }),
    req('Start session: invalid name (→ 400)', 'POST', '/creators/me/kyc/session', {
      as: 'creator',
      body: { firstName: 'T3st<>', lastName: 'Creator', dateOfBirth: '1995-10-12', country: 'NGA', documentType: 'NATIONAL_ID' },
      test: status(400),
    }),
    req('Start session (real Didit, or 503 if not configured)', 'POST', '/creators/me/kyc/session', {
      as: 'creator',
      body: { firstName: 'Test', lastName: 'Creator', dateOfBirth: '1995-10-12', country: 'NGA', documentType: 'NATIONAL_ID' },
      desc: `
**With Didit sandbox keys:** returns \`verificationUrl\` (open it in a browser to do the
hosted flow) and \`sessionToken\` (for the RN SDK). Calling it again with the same
details returns \`resumed: true\` and the same session.

**Without keys:** 503 \`KYC_PROVIDER_ERROR\`. Continue with folder 06.`,
      test: `
pm.test('200 with a session, or 503 when Didit is not configured', () => pm.expect(pm.response.code).to.be.oneOf([200, 502, 503]));
if (pm.response.code === 200) {
  const d = pm.response.json().data;
  pm.test('Has verificationUrl', () => pm.expect(d.verificationUrl).to.match(/^https?:/));
  pm.test('Has sessionToken', () => pm.expect(d.sessionToken).to.be.a('string'));
  ${set('kycSubmissionId', 'd.submissionId')}
  console.log('Open to complete verification:', d.verificationUrl);
}`,
    }),
    req('Resume session with same details (real Didit only)', 'POST', '/creators/me/kyc/session', {
      as: 'creator',
      body: { firstName: 'Test', lastName: 'Creator', dateOfBirth: '1995-10-12', country: 'NGA', documentType: 'NATIONAL_ID' },
      test: `
pm.test('200 resumed, or 503 when Didit is not configured', () => pm.expect(pm.response.code).to.be.oneOf([200, 502, 503]));
if (pm.response.code === 200) {
  pm.test('Resumed the same submission', () => {
    const d = pm.response.json().data;
    pm.expect(d.resumed).to.eql(true);
    pm.expect(d.submissionId).to.eql(pm.variables.get('kycSubmissionId'));
  });
}`,
    }),
  ],
);

const f06 = folder(
  '06 · KYC — Didit webhooks & admin review',
  `
Simulates Didit by sending **signed** webhooks to \`POST /webhooks/didit\` (outside
\`/api/v1\`). Requires \`DIDIT_WEBHOOK_SECRET\` and \`DIDIT_WORKFLOW_ID\` in
\`apps/api/.env\` to equal the collection variables \`diditWebhookSecret\` and
\`diditWorkflowId\`. Restart the API after editing \`.env\`.

The first webhook uses a new session id. The API has no row for it, so it
"adopts" it as a new submission (vendor_data = creatorId and workflow_id matches).

Flow: In Review → admin sees it in the queue → Approved (by admin via Didit, or by
webhook) → creator becomes ACTIVE.`,
  [
    req('Webhook: In Review (new session)', 'POST', '/webhooks/didit', {
      host: true,
      rawBody: '{{diditBody}}',
      headers: diditHeaders(),
      pre: diditPre('In Review', { newSession: true }),
      test: `
${status(200).trim()}
pm.test('Processed (not ignored)', () => {
  const b = pm.response.json().data;
  pm.expect(b.received).to.eql(true);
  pm.expect(b).to.not.have.property('ignored');
});`,
    }),
    req('Webhook: replay same event (idempotent)', 'POST', '/webhooks/didit', {
      host: true,
      rawBody: '{{diditBody}}',
      headers: diditHeaders(),
      desc: 'Resends the exact same signed body. Must be acknowledged without being applied twice. Run within 5 minutes of the previous request (signature freshness window).',
      test: `
${status(200).trim()}
pm.test('already_processed', () => pm.expect(pm.response.json().data.status).to.eql('already_processed'));`,
    }),
    req('Webhook: bad signature (→ 401)', 'POST', '/webhooks/didit', {
      host: true,
      rawBody: '{{diditBody}}',
      headers: diditHeaders('0000000000000000000000000000000000000000000000000000000000000000'),
      test: status(401) + errorCode('WEBHOOK_VERIFICATION_FAILED'),
    }),
    req('Webhook: stale timestamp (→ 401)', 'POST', '/webhooks/didit', {
      host: true,
      rawBody: '{{diditBody}}',
      headers: [
        { key: 'Content-Type', value: 'application/json' },
        { key: 'X-Timestamp', value: '1000000000' },
        { key: 'X-Signature', value: '{{diditSignature}}' },
      ],
      desc: 'X-Timestamp older than 5 minutes is rejected even with a valid signature.',
      test: status(401),
    }),
    req('Creator KYC status → NEEDS_REVIEW', 'GET', '/creators/me/kyc', {
      as: 'creator',
      test: `
${kycStatusTest('NEEDS_REVIEW', false).trim()}
pm.test('Cannot start a new session while under review', () => pm.expect(d.canStartSession).to.eql(false));`,
    }),
    req('Creator starts session while under review (→ 409)', 'POST', '/creators/me/kyc/session', {
      as: 'creator',
      body: { firstName: 'Test', lastName: 'Creator', dateOfBirth: '1995-10-12', country: 'NGA', documentType: 'NATIONAL_ID' },
      test: status(409) + errorCode('KYC_UNDER_REVIEW'),
    }),
    req('Admin: review queue (NEEDS_REVIEW)', 'GET', '/admin/kyc', {
      as: 'admin',
      desc: 'Defaults to status=NEEDS_REVIEW, oldest first. Saves this creator\'s submission as `{{kycSubmissionId}}`.',
      test: `
${status(200).trim()}
const json = pm.response.json();
const mine = json.data.find((s) => s.creator.id === pm.variables.get('creatorId'));
pm.test('Creator is in the review queue', () => pm.expect(mine).to.exist);
pm.test('Paginated meta', () => pm.expect(json.meta).to.have.keys('total', 'page', 'limit', 'totalPages', 'hasNextPage', 'hasPreviousPage'));
if (mine) ${set('kycSubmissionId', 'mine.id')}`,
    }),
    req('Admin: queue filtered + paginated', 'GET', '/admin/kyc?status=NEEDS_REVIEW&page=1&limit=5', {
      as: 'admin',
      test: `
${status(200).trim()}
pm.test('limit respected', () => pm.expect(pm.response.json().meta.limit).to.eql(5));`,
    }),
    req('Admin: queue with invalid status (→ 400)', 'GET', '/admin/kyc?status=NOPE', { as: 'admin', test: status(400) }),
    req('Admin: submission detail', 'GET', '/admin/kyc/{{kycSubmissionId}}', {
      as: 'admin',
      desc: '`providerDecision` is fetched live from Didit (null + `providerError` if Didit is not configured). Viewing is audit-logged.',
      test: `
${status(200).trim()}
const d = pm.response.json().data;
pm.test('Status NEEDS_REVIEW', () => pm.expect(d.status).to.eql('NEEDS_REVIEW'));
pm.test('Event history recorded', () => pm.expect(d.events.length).to.be.greaterThan(0));`,
    }),
    req('Admin: detail with non-UUID (→ 400)', 'GET', '/admin/kyc/not-a-uuid', { as: 'admin', test: status(400) }),
    req('Creator: admin KYC route (→ 403)', 'GET', '/admin/kyc', { as: 'creator', test: status(403) }),
    req('Admin: reject without reason (→ 400)', 'POST', '/admin/kyc/{{kycSubmissionId}}/reject', {
      as: 'admin',
      body: { note: 'missing reason' },
      test: status(400),
    }),
    req('Option A — Admin: approve (needs real Didit)', 'POST', '/admin/kyc/{{kycSubmissionId}}/approve', {
      as: 'admin',
      body: { note: 'Document checked manually' },
      desc: `
Tells Didit first, then updates locally. With a **simulated** session Didit does not
know the session id, so this returns 502/503 and nothing changes — run Option B instead.
With a real sandbox session it returns 200 and the submission becomes VERIFIED.`,
      test: `
pm.test('200 (real Didit) or 502/503 (simulated session)', () => pm.expect(pm.response.code).to.be.oneOf([200, 502, 503]));`,
    }),
    req('Option B — Webhook: Approved (same session)', 'POST', '/webhooks/didit', {
      host: true,
      rawBody: '{{diditBody}}',
      headers: diditHeaders(),
      pre: diditPre('Approved', { decision: approvedDecision }),
      desc: 'Harmless if Option A already approved: same-status events only refresh sync metadata.',
      test: `
${status(200).trim()}
pm.test('Received', () => pm.expect(pm.response.json().data.received).to.eql(true));`,
    }),
    req('Creator KYC status → VERIFIED', 'GET', '/creators/me/kyc', {
      as: 'creator',
      test: `
${kycStatusTest('VERIFIED', true).trim()}
pm.test('Creator ACTIVE', () => pm.expect(d.creatorStatus).to.eql('ACTIVE'));
pm.test('Cannot start another session', () => pm.expect(d.canStartSession).to.eql(false));`,
    }),
    req('Creator starts session when verified (→ 409)', 'POST', '/creators/me/kyc/session', {
      as: 'creator',
      body: { firstName: 'Test', lastName: 'Creator', dateOfBirth: '1995-10-12', country: 'NGA', documentType: 'NATIONAL_ID' },
      test: status(409) + errorCode('KYC_ALREADY_VERIFIED'),
    }),
    req('Admin: approve an already-verified submission (→ 409)', 'POST', '/admin/kyc/{{kycSubmissionId}}/approve', {
      as: 'admin',
      body: {},
      test: status(409) + errorCode('KYC_INVALID_TRANSITION'),
    }),
    req('Discover creators (now listed)', 'GET', '/creators?search={{creatorSlug}}', {
      test: `
${status(200).trim()}
pm.test('Verified creator is listed', () => pm.expect(pm.response.json().data.length).to.eql(1));`,
    }),
  ],
);

const f07 = folder(
  '07 · Support & payment (Paystack)',
  `
Supporter buys yards → payment is initialized → Paystack's \`charge.success\`
webhook marks it paid and writes ledger entries.

The Paystack provider is currently a **mock**: \`initialize\` returns a fake
\`authorizationUrl\` without calling Paystack. The webhook is simulated here and signed
with HMAC-SHA512 using \`{{paystackWebhookSecret}}\`, which must equal
\`PAYSTACK_WEBHOOK_SECRET\` in \`apps/api/.env\`.

Money is in kobo. With the seed data: Ankara is 500000 (NGN 5,000) × 2 = 1,000,000;
platform fee 10% = 100,000; creator gets 900,000.`,
  [
    req('Create support: self-support (→ 400)', 'POST', '/supports', {
      as: 'creator',
      body: { creatorId: '{{creatorId}}', items: [{ creatorMaterialId: '{{creatorMaterialId}}', quantity: 1 }] },
      test: status(400) + errorCode('SELF_SUPPORT_NOT_ALLOWED'),
    }),
    req('Create support: quantity 0 (→ 400)', 'POST', '/supports', {
      as: 'supporter',
      body: { creatorId: '{{creatorId}}', items: [{ creatorMaterialId: '{{creatorMaterialId}}', quantity: 0 }] },
      test: status(400),
    }),
    req('Create support: empty items (→ 400)', 'POST', '/supports', {
      as: 'supporter',
      body: { creatorId: '{{creatorId}}', items: [] },
      test: status(400),
    }),
    req('Create support: inactive material (→ 400)', 'POST', '/supports', {
      as: 'supporter',
      body: { creatorId: '{{creatorId}}', items: [{ creatorMaterialId: '{{inactiveCreatorMaterialId}}', quantity: 1 }] },
      test: status(400) + errorCode('MATERIAL_NOT_FOUND'),
    }),
    req('Create support: client price ignored (→ 400 unknown field)', 'POST', '/supports', {
      as: 'supporter',
      body: { creatorId: '{{creatorId}}', items: [{ creatorMaterialId: '{{creatorMaterialId}}', quantity: 1, unitPrice: 1 }] },
      desc: 'The client can never send prices; unknown fields are rejected.',
      test: status(400),
    }),
    req('Create support: unknown creator (→ 404)', 'POST', '/supports', {
      as: 'supporter',
      body: { creatorId: '00000000-0000-0000-0000-000000000000', items: [{ creatorMaterialId: '{{creatorMaterialId}}', quantity: 1 }] },
      test: status(404) + errorCode('CREATOR_NOT_FOUND'),
    }),
    req('Create support (2 yards)', 'POST', '/supports', {
      as: 'supporter',
      body: {
        creatorId: '{{creatorId}}',
        items: [{ creatorMaterialId: '{{creatorMaterialId}}', quantity: 2 }],
        message: 'Keep creating!',
        isAnonymous: false,
      },
      test: `
${status(201).trim()}
const d = pm.response.json().data;
const unit = Number(pm.variables.get('creatorMaterialPrice'));
pm.test('Status CREATED', () => pm.expect(d.status).to.eql('CREATED'));
pm.test('Server computed subtotal', () => pm.expect(d.subtotal).to.eql(unit * 2));
pm.test('Fee + creator amount = total', () => pm.expect(d.platformFee + d.creatorAmount).to.eql(d.totalAmount));
pm.test('10% platform fee', () => pm.expect(d.platformFee).to.eql(Math.round(d.subtotal * 0.1)));
pm.test('Price snapshot stored', () => pm.expect(d.items[0].unitPrice).to.eql(unit));
${set('supportId', 'd.id')}
${set('supportTotal', 'String(d.totalAmount)')}
${set('expectedCreatorAmount', 'String(d.creatorAmount)')}`,
    }),
    req('Get support', 'GET', '/supports/{{supportId}}', {
      as: 'supporter',
      test: `
${status(200).trim()}
pm.test('No payment yet', () => pm.expect(pm.response.json().data.payment).to.be.null);`,
    }),
    req('Initialize payment', 'POST', '/payments/initialize', {
      as: 'supporter',
      body: { supportId: '{{supportId}}', email: '{{supporterEmail}}' },
      test: `
${status(201).trim()}
const d = pm.response.json().data;
pm.test('Has authorizationUrl', () => pm.expect(d.authorizationUrl).to.match(/^https:/));
pm.test('Has provider reference', () => pm.expect(d.providerReference).to.be.a('string'));
${set('paymentId', 'd.paymentId')}
${set('paymentReference', 'd.providerReference')}`,
    }),
    req('Support is PAYMENT_PENDING', 'GET', '/supports/{{supportId}}', {
      as: 'supporter',
      test: `
${status(200).trim()}
const d = pm.response.json().data;
pm.test('Support PAYMENT_PENDING', () => pm.expect(d.status).to.eql('PAYMENT_PENDING'));
pm.test('Payment PROCESSING', () => pm.expect(d.payment.status).to.eql('PROCESSING'));`,
    }),
    req('Paystack webhook: bad signature (→ 400)', 'POST', '/webhooks/paystack', {
      host: true,
      rawBody: '{"event":"charge.success","data":{"id":1,"reference":"{{paymentReference}}"}}',
      headers: paystackHeaders('deadbeef'),
      test: status(400) + errorCode('WEBHOOK_VERIFICATION_FAILED'),
    }),
    req('Paystack webhook: charge.success', 'POST', '/webhooks/paystack', {
      host: true,
      rawBody: '{{paystackBody}}',
      headers: paystackHeaders(),
      pre: paystackPre,
      test: `
${status(201).trim()}
pm.test('Received', () => pm.expect(pm.response.json().data.received).to.eql(true));`,
    }),
    req('Paystack webhook: replay (idempotent)', 'POST', '/webhooks/paystack', {
      host: true,
      rawBody: '{{paystackBody}}',
      headers: paystackHeaders(),
      desc: 'Same event id again. Must not credit the creator twice.',
      test: `
${status(201).trim()}
pm.test('already_processed', () => pm.expect(pm.response.json().data.status).to.eql('already_processed'));`,
    }),
    req('Support is PAID', 'GET', '/supports/{{supportId}}', {
      as: 'supporter',
      test: `
${status(200).trim()}
const d = pm.response.json().data;
pm.test('Support PAID', () => pm.expect(d.status).to.eql('PAID'));
pm.test('Payment SUCCESS', () => pm.expect(d.payment.status).to.eql('SUCCESS'));`,
    }),
    req('Initialize payment again (→ 400 already processed)', 'POST', '/payments/initialize', {
      as: 'supporter',
      body: { supportId: '{{supportId}}', email: '{{supporterEmail}}' },
      test: status(400) + errorCode('PAYMENT_ALREADY_PROCESSED'),
    }),
    req('Supporter support history', 'GET', '/supporters/me/supports', {
      as: 'supporter',
      test: `
${status(200).trim()}
pm.test('Contains the paid support', () => {
  const s = pm.response.json().data.find((x) => x.id === pm.variables.get('supportId'));
  pm.expect(s.status).to.eql('PAID');
});`,
    }),
    req('Create second support (kept unpaid for folder 10)', 'POST', '/supports', {
      as: 'supporter',
      body: { creatorId: '{{creatorId}}', items: [{ creatorMaterialId: '{{creatorMaterialId}}', quantity: 1 }] },
      desc: 'Left unpaid on purpose. Folder 10 tries to pay it after the creator is revoked.',
      test: `
${status(201).trim()}
${set('pendingSupportId', 'pm.response.json().data.id')}`,
    }),
  ],
);

const f08 = folder(
  '08 · Ledger & payouts',
  `
Balance is computed from immutable ledger entries. A payout immediately writes a
DEBIT reservation so the same money cannot be withdrawn twice.

Needs the payout method from \`02-seed-creator-fixtures.sql\`.`,
  [
    req('Creator balance = creator share', 'GET', '/creators/me/balance', {
      as: 'creator',
      test: `
${status(200).trim()}
const d = pm.response.json().data;
pm.test('Balance equals creatorAmount of the paid support', () => pm.expect(d.availableBalance).to.eql(Number(pm.variables.get('expectedCreatorAmount'))));
pm.test('Currency NGN', () => pm.expect(d.currency).to.eql('NGN'));
${set('balanceBeforePayout', 'String(d.availableBalance)')}`,
    }),
    req('Payout: more than balance (→ 400 INSUFFICIENT_FUNDS)', 'POST', '/creators/me/payouts', {
      as: 'creator',
      rawBody: '{\n  "amount": {{overdrawAmount}}\n}',
      pre: `pm.variables.set('overdrawAmount', Number(pm.variables.get('balanceBeforePayout')) + 1);`,
      test: status(400) + errorCode('INSUFFICIENT_FUNDS'),
    }),
    req('Payout: fractional amount (→ 400 INVALID_AMOUNT)', 'POST', '/creators/me/payouts', {
      as: 'creator',
      body: { amount: 100.5 },
      test: status(400) + errorCode('INVALID_AMOUNT'),
    }),
    req('Payout: negative amount (→ 400 INVALID_AMOUNT)', 'POST', '/creators/me/payouts', {
      as: 'creator',
      body: { amount: -500 },
      test: status(400) + errorCode('INVALID_AMOUNT'),
    }),
    req('Payout: supporter has no creator profile (→ 404)', 'POST', '/creators/me/payouts', {
      as: 'supporter',
      body: { amount: 100 },
      test: status(404),
    }),
    req('Payout: request NGN 5,000', 'POST', '/creators/me/payouts', {
      as: 'creator',
      body: { amount: 500000, currency: 'NGN' },
      test: `
${status(201).trim()}
const d = pm.response.json().data;
pm.test('Status REQUESTED', () => pm.expect(d.status).to.eql('REQUESTED'));
${set('payoutId', 'd.id')}`,
    }),
    req('Balance reduced by reservation', 'GET', '/creators/me/balance', {
      as: 'creator',
      test: `
${status(200).trim()}
pm.test('Balance dropped by 500000', () => pm.expect(pm.response.json().data.availableBalance).to.eql(Number(pm.variables.get('balanceBeforePayout')) - 500000));`,
    }),
  ],
);

const f09 = folder(
  '09 · Follows, content, notifications, moderation',
  'Social features. Posts come from `02-seed-creator-fixtures.sql`.',
  [
    req('Follow creator', 'POST', '/creators/{{creatorId}}/follow', {
      as: 'supporter',
      desc: '`:id` is the creator **profile** id, not the user id.',
      test: status(201),
    }),
    req('Follow again (idempotent)', 'POST', '/creators/{{creatorId}}/follow', { as: 'supporter', test: status(201) }),
    req('My following list', 'GET', '/me/following', {
      as: 'supporter',
      test: `
${status(200).trim()}
pm.test('Following exactly this creator once', () => {
  const rows = pm.response.json().data.filter((f) => f.creatorId === pm.variables.get('creatorId'));
  pm.expect(rows.length).to.eql(1);
});`,
    }),
    req('Unfollow creator', 'DELETE', '/creators/{{creatorId}}/follow', {
      as: 'supporter',
      test: `
${status(200).trim()}
pm.test('One row deleted', () => pm.expect(pm.response.json().data.count).to.eql(1));`,
    }),
    req('Creator posts (anonymous)', 'GET', '/creators/{{creatorSlug}}/posts', {
      test: `
${status(200).trim()}
const posts = pm.response.json().data;
pm.test('Drafts are hidden', () => pm.expect(posts.find((p) => p.title === 'Unfinished draft')).to.be.undefined);
const exclusive = posts.find((p) => p.visibility === 'EXCLUSIVE');
pm.test('Exclusive post is locked', () => {
  pm.expect(exclusive.isLocked).to.eql(true);
  pm.expect(exclusive.media).to.eql([]);
});
const pub = posts.find((p) => p.visibility === 'PUBLIC');
if (pub) ${set('postId', 'pub.id')}`,
    }),
    req('Creator posts as the creator (known gap: still locked)', 'GET', '/creators/{{creatorSlug}}/posts', {
      as: 'creator',
      desc: `
**Known gap.** The route is \`@Public()\`, and the AuthGuard skips session resolution
for public routes, so \`viewerUserId\` is always undefined. The owner (and entitled
supporters) therefore see exclusive posts as locked. This test documents current
behaviour and will fail once that is fixed.`,
      test: `
${status(200).trim()}
pm.test('Exclusive post still locked for owner (current behaviour)', () => {
  const ex = pm.response.json().data.find((p) => p.visibility === 'EXCLUSIVE');
  pm.expect(ex.isLocked).to.eql(true);
});`,
    }),
    req('Report a post', 'POST', '/posts/{{postId}}/report', {
      as: 'supporter',
      body: { reason: 'SPAM', description: 'Testing the moderation flow' },
      test: `
${status(201).trim()}
pm.test('Report PENDING', () => pm.expect(pm.response.json().data.status).to.eql('PENDING'));`,
    }),
    req('Creator notifications (KYC updates)', 'GET', '/me/notifications', {
      as: 'creator',
      desc: 'The KYC state machine writes a notification on NEEDS_REVIEW and VERIFIED.',
      test: `
${status(200).trim()}
const items = pm.response.json().data;
pm.test('Has KYC notifications', () => pm.expect(items.filter((n) => n.type === 'KYC_UPDATE').length).to.be.greaterThan(0));
if (items[0]) ${set('notificationId', 'items[0].id')}`,
    }),
    req('Mark one notification read', 'PATCH', '/me/notifications/{{notificationId}}/read', {
      as: 'creator',
      test: `
${status(200).trim()}
pm.test('One updated', () => pm.expect(pm.response.json().data.count).to.eql(1));`,
    }),
    req("Mark someone else's notification read (no-op)", 'PATCH', '/me/notifications/{{notificationId}}/read', {
      as: 'supporter',
      desc: 'Scoped to the caller: another user cannot touch it.',
      test: `
${status(200).trim()}
pm.test('Nothing updated', () => pm.expect(pm.response.json().data.count).to.eql(0));`,
    }),
    req('Mark all notifications read', 'POST', '/me/notifications/read-all', {
      as: 'creator',
      test: status(201),
    }),
    req('All notifications are read', 'GET', '/me/notifications', {
      as: 'creator',
      test: `
${status(200).trim()}
pm.test('No unread', () => pm.expect(pm.response.json().data.filter((n) => !n.readAt).length).to.eql(0));`,
    }),
  ],
);

const f10 = folder(
  '10 · Admin — dashboard, revoke & re-verify',
  `
Admin revokes the creator's verification: contributions and payouts stop, and the
creator is blocked from verifying again until an admin unblocks them. Then the creator
goes through KYC again (first declined, then approved).`,
  [
    req('Admin summary', 'GET', '/admin/summary', {
      as: 'admin',
      test: `
${status(200).trim()}
pm.test('Has counters', () => pm.expect(pm.response.json().data).to.have.keys('totalUsers', 'totalCreators', 'totalSupports', 'totalPayouts'));`,
    }),
    req('Audit logs', 'GET', '/admin/audit-logs', {
      as: 'admin',
      test: `
${status(200).trim()}
pm.test('KYC actions are audited', () => {
  const actions = pm.response.json().data.map((a) => a.action);
  pm.expect(actions).to.include('KYC_SUBMISSION_STATUS_CHANGED');
});`,
    }),
    req('Revoke: missing reason (→ 400)', 'POST', '/admin/kyc/creators/{{creatorId}}/revoke', {
      as: 'admin',
      body: {},
      test: status(400),
    }),
    req('Revoke creator verification', 'POST', '/admin/kyc/creators/{{creatorId}}/revoke', {
      as: 'admin',
      body: { reason: 'Document reported as fraudulent', note: 'Postman test' },
      desc: 'Local-first: works even when Didit is unreachable (the provider update is best-effort).',
      test: `
${status(200).trim()}
pm.test('Submission REJECTED', () => pm.expect(pm.response.json().data.status).to.eql('REJECTED'));`,
    }),
    req('Revoke again (→ 409)', 'POST', '/admin/kyc/creators/{{creatorId}}/revoke', {
      as: 'admin',
      body: { reason: 'again' },
      test: status(409) + errorCode('KYC_INVALID_TRANSITION'),
    }),
    req('Creator KYC status → REJECTED, blocked', 'GET', '/creators/me/kyc', {
      as: 'creator',
      test: `
${kycStatusTest('REJECTED', false).trim()}
pm.test('Blocked from new sessions', () => pm.expect(d.canStartSession).to.eql(false));
pm.test('Reason shown to creator', () => pm.expect(d.latestSubmission.rejectionReason).to.eql('Document reported as fraudulent'));`,
    }),
    req('Creator starts session while blocked (→ 403 KYC_BLOCKED)', 'POST', '/creators/me/kyc/session', {
      as: 'creator',
      body: { firstName: 'Test', lastName: 'Creator', dateOfBirth: '1995-10-12', country: 'NGA', documentType: 'NATIONAL_ID' },
      test: status(403) + errorCode('KYC_BLOCKED'),
    }),
    req('Pay pending support after revoke (→ 403)', 'POST', '/payments/initialize', {
      as: 'supporter',
      body: { supportId: '{{pendingSupportId}}', email: '{{supporterEmail}}' },
      desc: 'Checkout re-checks the creator, so a support created while they were verified cannot be paid now.',
      test: status(403) + errorCode('CREATOR_NOT_ACTIVE'),
    }),
    req('New support after revoke (→ 403)', 'POST', '/supports', {
      as: 'supporter',
      body: { creatorId: '{{creatorId}}', items: [{ creatorMaterialId: '{{creatorMaterialId}}', quantity: 1 }] },
      test: status(403) + errorCode('CREATOR_NOT_ACTIVE'),
    }),
    req('Payout after revoke (→ 400 KYC_REQUIRED)', 'POST', '/creators/me/payouts', {
      as: 'creator',
      body: { amount: 100 },
      test: status(400) + errorCode('KYC_REQUIRED'),
    }),
    req('Balance is kept after revoke', 'GET', '/creators/me/balance', {
      as: 'creator',
      desc: 'Revocation freezes withdrawals; it does not touch earned funds.',
      test: `
${status(200).trim()}
pm.test('Balance unchanged', () => pm.expect(pm.response.json().data.availableBalance).to.eql(Number(pm.variables.get('balanceBeforePayout')) - 500000));`,
    }),
    req('Unblock creator', 'POST', '/admin/kyc/creators/{{creatorId}}/unblock', {
      as: 'admin',
      body: { note: 'Cleared after investigation' },
      test: `
${status(200).trim()}
pm.test('Block lifted', () => pm.expect(pm.response.json().data.kycBlockedAt).to.be.null);`,
    }),
    req('Unblock again (→ 409)', 'POST', '/admin/kyc/creators/{{creatorId}}/unblock', {
      as: 'admin',
      body: {},
      test: status(409),
    }),
    req('Creator can verify again', 'GET', '/creators/me/kyc', {
      as: 'creator',
      test: `
${kycStatusTest('REJECTED', false).trim()}
pm.test('canStartSession true', () => pm.expect(d.canStartSession).to.eql(true));`,
    }),
    req('Webhook: Declined (new session)', 'POST', '/webhooks/didit', {
      host: true,
      rawBody: '{{diditBody}}',
      headers: diditHeaders(),
      pre: diditPre('Declined', { newSession: true, decision: declinedDecision }),
      test: status(200),
    }),
    req('Creator sees a safe rejection reason', 'GET', '/creators/me/kyc', {
      as: 'creator',
      desc: 'Provider risk code DOCUMENT_EXPIRED is mapped to a creator-safe message; raw codes are admin-only.',
      test: `
${kycStatusTest('REJECTED', false).trim()}
pm.test('Expired-document message', () => pm.expect(d.latestSubmission.rejectionReason).to.include('expired'));`,
    }),
    req('Webhook: Approved (new session)', 'POST', '/webhooks/didit', {
      host: true,
      rawBody: '{{diditBody}}',
      headers: diditHeaders(),
      pre: diditPre('Approved', { newSession: true, decision: approvedDecision }),
      test: status(200),
    }),
    req('Creator verified and ACTIVE again', 'GET', '/creators/me/kyc', {
      as: 'creator',
      test: `
${kycStatusTest('VERIFIED', true).trim()}
pm.test('Creator ACTIVE', () => pm.expect(d.creatorStatus).to.eql('ACTIVE'));`,
    }),
  ],
);

const f11 = folder(
  '11 · Logout',
  'Ends sessions. Run last.',
  [
    req('Logout supporter', 'POST', '/auth/logout', { as: 'supporter', test: status(200) }),
    req('Old supporter token is rejected (→ 401)', 'GET', '/users/me', { as: 'supporter', test: status(401) }),
    req('Logout creator', 'POST', '/auth/logout', { as: 'creator', test: status(200) }),
  ],
);

// ---------------------------------------------------------------------------
// Planned endpoints (not implemented yet)
// ---------------------------------------------------------------------------
const planned = (name, method, urlPath, opts = {}) =>
  req(`[PLANNED] ${name}`, method, urlPath, {
    ...opts,
    desc: `**Not implemented yet — returns 404 today.** Proposed contract.\n\n${(opts.desc || '').trim()}`,
    test: `
pm.test('Not implemented yet (404). Update this test when the endpoint ships.', () => pm.response.to.have.status(404));`,
  });

const f12 = folder(
  '12 · Planned endpoints (not implemented yet)',
  `
Endpoints the workflow needs but that do not exist yet. Each currently returns **404**
and its test asserts that, so the folder goes red as soon as one ships — update the
request and test then. Until then, the SQL fixtures cover what these would do.

Bodies and paths are **proposals** based on the Prisma schema, not a settled contract.`,
  [
    folder('Creator yard menu', 'Replaces the creator_materials part of 02-seed-creator-fixtures.sql.', [
      planned('Add material to my menu', 'POST', '/creators/me/materials', {
        as: 'creator',
        body: { materialId: '<catalogue material id>', price: 500000, displayName: 'Ankara (1 yard)', description: 'Support with a yard of Ankara' },
        desc: 'price in kobo. Unique per (creator, material).',
      }),
      planned('Update menu item', 'PATCH', '/creators/me/materials/{{creatorMaterialId}}', {
        as: 'creator',
        body: { price: 600000, status: 'INACTIVE' },
        desc: 'Must not change prices on existing supports (they keep their snapshot).',
      }),
      planned('Remove menu item', 'DELETE', '/creators/me/materials/{{creatorMaterialId}}', { as: 'creator' }),
    ]),
    folder('Creator profile', '', [
      planned('Update my creator profile', 'PATCH', '/creators/me', {
        as: 'creator',
        body: { bio: 'Fashion creator from Lagos', avatarUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' },
      }),
      planned('Supports I received', 'GET', '/creators/me/supports?status=PAID&page=1&limit=20', { as: 'creator' }),
      planned('My followers', 'GET', '/creators/me/followers', { as: 'creator' }),
    ]),
    folder('Payout methods & payout history', 'Replaces the payout_methods part of the SQL fixtures.', [
      planned('List banks', 'GET', '/payouts/banks?country=NG', { as: 'creator', desc: 'Proxy of Paystack /bank.' }),
      planned('Resolve bank account', 'POST', '/creators/me/payout-methods/resolve', {
        as: 'creator',
        body: { bankCode: '058', accountNumber: '0123456789' },
        desc: 'Returns the account name from Paystack before saving.',
      }),
      planned('Add payout method', 'POST', '/creators/me/payout-methods', {
        as: 'creator',
        body: { bankCode: '058', accountNumber: '0123456789', isDefault: true },
        desc: 'Should create a Paystack transfer recipient and store its code as accountIdentifier. Likely gated on KYC VERIFIED and name match.',
      }),
      planned('List payout methods', 'GET', '/creators/me/payout-methods', { as: 'creator' }),
      planned('Set default payout method', 'PATCH', '/creators/me/payout-methods/{{payoutMethodId}}', { as: 'creator', body: { isDefault: true } }),
      planned('Delete payout method', 'DELETE', '/creators/me/payout-methods/{{payoutMethodId}}', { as: 'creator' }),
      planned('My payout history', 'GET', '/creators/me/payouts', { as: 'creator' }),
      planned('Payout detail', 'GET', '/creators/me/payouts/{{payoutId}}', { as: 'creator' }),
      planned('Cancel requested payout', 'POST', '/creators/me/payouts/{{payoutId}}/cancel', {
        as: 'creator',
        desc: 'Should write a PAYOUT_REVERSED credit so the reservation is released.',
      }),
      planned('Ledger / transactions', 'GET', '/creators/me/transactions?page=1&limit=20', { as: 'creator' }),
    ]),
    folder('Payments', '', [
      planned('Verify payment by reference', 'GET', '/payments/verify/{{paymentReference}}', {
        as: 'supporter',
        desc: 'Fallback when the webhook is late: calls Paystack /transaction/verify. PaystackProvider.verifyPayment exists but is a mock and has no route.',
      }),
      req('[PARTIAL] Paystack transfer.success (ignored today)', 'POST', '/webhooks/paystack', {
        host: true,
        rawBody: '{{paystackTransferBody}}',
        headers: paystackHeaders(),
        pre: `
const body = JSON.stringify({ event: 'transfer.success', data: { id: Math.floor(Math.random() * 1e9), reference: 'PAYOUT_' + pm.variables.get('payoutId'), amount: 500000, currency: 'NGN' } });
pm.collectionVariables.set('paystackTransferBody', body);
pm.collectionVariables.set('paystackSignature', CryptoJS.HmacSHA512(body, pm.variables.get('paystackWebhookSecret')).toString(CryptoJS.enc.Hex));`,
        desc: `**Partially implemented.** The route exists but only acts on \`charge.success\`.
\`transfer.success\`, \`transfer.failed\`, \`charge.failed\` and \`refund.processed\` are acknowledged
and ignored, so payouts stay REQUESTED forever and nothing writes PAYOUT_COMPLETED /
PAYOUT_REVERSED ledger entries. When implemented, this should move the payout to SUCCESS.`,
        test: `
pm.test('Acknowledged (201) but not acted on yet', () => pm.response.to.have.status(201));`,
      }),
    ]),
    folder('Posts & media', 'Replaces the posts part of the SQL fixtures.', [
      planned('Upload media (signed Cloudinary upload)', 'POST', '/media/uploads', {
        as: 'creator',
        body: { mimeType: 'image/jpeg', fileSize: 204800, mediaType: 'image' },
      }),
      planned('Create post', 'POST', '/creators/me/posts', {
        as: 'creator',
        body: { title: 'New drop', body: 'Sketches for my supporters', visibility: 'EXCLUSIVE', mediaIds: [] },
      }),
      planned('List my posts (incl. drafts)', 'GET', '/creators/me/posts', { as: 'creator', desc: 'Today this matches GET /creators/:slug/posts with slug "me" and 404s as CREATOR_NOT_FOUND. The real route must be declared before :slug.' }),
      planned('Update post', 'PATCH', '/posts/{{postId}}', { as: 'creator', body: { title: 'Updated title' } }),
      planned('Publish post', 'POST', '/posts/{{postId}}/publish', { as: 'creator' }),
      planned('Delete post', 'DELETE', '/posts/{{postId}}', { as: 'creator' }),
      planned('Get single post', 'GET', '/posts/{{postId}}', { as: 'supporter' }),
    ]),
    folder('Supporter', '', [
      planned('Support detail (owner-scoped)', 'GET', '/supporters/me/supports/{{supportId}}', {
        as: 'supporter',
        desc: 'Today GET /supports/:id returns any support to any signed-in user; an owner-scoped route is needed.',
      }),
    ]),
    folder('Admin', '', [
      planned('List creators', 'GET', '/admin/creators?status=ACTIVE&page=1&limit=20', { as: 'admin' }),
      planned('Suspend creator', 'PATCH', '/admin/creators/{{creatorId}}/status', { as: 'admin', body: { status: 'SUSPENDED', reason: 'Policy violation' } }),
      planned('List users', 'GET', '/admin/users?page=1&limit=20', { as: 'admin' }),
      planned('Change user status', 'PATCH', '/admin/users/{{supporterUserId}}/status', { as: 'admin', body: { status: 'SUSPENDED' } }),
      planned('Manage catalogue: create material', 'POST', '/admin/materials', {
        as: 'admin',
        body: { name: 'Kente', slug: 'kente', defaultPrice: 800000, currency: 'NGN' },
        desc: 'Replaces 01-seed-catalogue.sql.',
      }),
      planned('Manage catalogue: update material', 'PATCH', '/admin/materials/{{materialSlug}}', { as: 'admin', body: { status: 'INACTIVE' } }),
      planned('Content reports queue', 'GET', '/admin/reports?status=PENDING', { as: 'admin' }),
      planned('Resolve content report', 'PATCH', '/admin/reports/{{reportId}}', { as: 'admin', body: { status: 'RESOLVED', action: 'REMOVE_POST' } }),
      planned('Payouts queue', 'GET', '/admin/payouts?status=REQUESTED', { as: 'admin' }),
      planned('Approve payout (initiate transfer)', 'POST', '/admin/payouts/{{payoutId}}/approve', { as: 'admin' }),
      planned('Fail / reverse payout', 'POST', '/admin/payouts/{{payoutId}}/reject', { as: 'admin', body: { reason: 'Bank details mismatch' } }),
      planned('Refund a support', 'POST', '/admin/supports/{{supportId}}/refund', { as: 'admin', body: { amount: 1000000, reason: 'Duplicate charge' } }),
      planned('Platform ledger balance', 'GET', '/admin/ledger/platform', { as: 'admin' }),
    ]),
  ],
);

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------
const collection = {
  info: {
    name: 'Buy Me a Yard API — Full Workflow',
    description: `
End-to-end workflow for the Buy Me a Yard API: auth → creator onboarding → KYC (Didit) →
support & payment (Paystack) → ledger & payouts → social → admin.

**Run the folders in order.** Each request's test script saves the ids and tokens the
next requests need (as collection variables). Step-by-step instructions:
\`docs/TESTING_GUIDE.md\`.

Import \`BuyMeAYard.local.postman_environment.json\` too, and make sure its secrets match
\`apps/api/.env\`.`.trim(),
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [f00, f01, f02, f03, f04, f05, f06, f07, f08, f09, f10, f11, f12],
  variable: [
    ['baseUrl', 'http://localhost:3000/api/v1'],
    ['hostUrl', 'http://localhost:3000'],
    ['adminEmail', 'admin@buymeayard.com'],
    ['adminPassword', 'AdminPassword123!'],
    ['testPassword', 'TestP@ssw0rd123'],
    ['paystackWebhookSecret', 'xxx'],
    ['diditWebhookSecret', 'local-didit-webhook-secret'],
    ['diditWorkflowId', 'local-workflow'],
  ].map(([key, value]) => ({ key, value, type: 'string' })),
};

const environment = {
  name: 'Buy Me a Yard — Local (development only, never use these credentials elsewhere)',
  values: [
    ['baseUrl', 'http://localhost:3000/api/v1', 'default'],
    ['hostUrl', 'http://localhost:3000', 'default'],
    ['adminEmail', 'admin@buymeayard.com', 'default'],
    ['adminPassword', 'AdminPassword123!', 'secret'],
    ['testPassword', 'TestP@ssw0rd123', 'secret'],
    ['paystackWebhookSecret', 'xxx', 'secret'],
    ['diditWebhookSecret', 'local-didit-webhook-secret', 'secret'],
    ['diditWorkflowId', 'local-workflow', 'default'],
  ].map(([key, value, type]) => ({ key, value, type, enabled: true })),
  _postman_variable_scope: 'environment',
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'BuyMeAYard.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n');
fs.writeFileSync(path.join(outDir, 'BuyMeAYard.local.postman_environment.json'), JSON.stringify(environment, null, 2) + '\n');

const count = (items) => items.reduce((n, i) => n + (i.item ? count(i.item) : 1), 0);
console.log(`Wrote ${count(collection.item)} requests to ${outDir}`);
