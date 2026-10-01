# End-to-End Testing Guide (Postman)

This guide walks through testing the whole Buy Me a Yard backend with the Postman collection in [`docs/postman/`](postman/). One run covers the full money path: a creator signs up, onboards and passes KYC, a supporter buys yards, the payment webhook credits the ledger, and the creator withdraws. It also covers the admin KYC controls and every guard along the way.

The collection has **168 requests and about 280 assertions**. A clean run passes every assertion. The two requests that need a token from an email are skipped automatically unless you supply the token.

---

## 1. What's in `docs/postman/`

| File | Purpose |
| :--- | :--- |
| `BuyMeAYard.postman_collection.json` | The collection. Import this. |
| `BuyMeAYard.local.postman_environment.json` | Local environment: URLs, admin login, webhook secrets. Import this too. |
| `sql/01-seed-catalogue.sql` | Seeds the platform materials catalogue (Ankara, Lace, Aso-oke, Adire). Run once per database. |
| `sql/02-seed-creator-fixtures.sql` | Gives one creator a yard menu, a payout method and three posts. Run once per test run, after onboarding. |
| `sql/99-force-verify-creator.sql` | Fallback that marks a creator verified without KYC. Use it only if you can't configure the Didit webhook secret. |
| `build-collection.js` | Generates the two JSON files. Edit this file, not the JSON, then run `node docs/postman/build-collection.js docs/postman`. |

### Why there's SQL

Some parts of the workflow have database tables but no endpoints yet: the materials catalogue, a creator's yard menu, payout methods and posts. The SQL files fill those gaps so the rest of the flow can be tested. Folder **12 · Planned endpoints** lists the endpoints that would replace them (see [section 7](#7-planned-endpoints-folder-12)).

---

## 2. One-time setup

### 2.1 Start the backing services and apply migrations

From the repo root:

```bash
pnpm install
pnpm --filter @buymeayard/types build
pnpm db:up                    # Postgres + Redis in Docker
pnpm db:migrate               # applies all migrations, including 20261001120000_kyc_didit_integration
cd apps/api && pnpm prisma db seed && cd ../..   # roles + super admin
```

> **Check the KYC migration is applied.** If `npx prisma migrate status` (run in `apps/api`) lists `20261001120000_kyc_didit_integration` as not yet applied, every KYC request will fail with a 500.

### 2.2 Seed the materials catalogue

```bash
docker exec -i buymeayard-postgres psql -U postgres -d buymeayard \
  < docs/postman/sql/01-seed-catalogue.sql
```

This is safe to re-run.

### 2.3 Configure `apps/api/.env`

The collection signs webhooks itself, so three secrets in `.env` must match three Postman variables:

| `apps/api/.env` | Postman variable | Suggested local value |
| :--- | :--- | :--- |
| `PAYSTACK_WEBHOOK_SECRET` | `paystackWebhookSecret` | `xxx` (the `.env.example` default) |
| `DIDIT_WEBHOOK_SECRET` | `diditWebhookSecret` | `local-didit-webhook-secret` |
| `DIDIT_WORKFLOW_ID` | `diditWorkflowId` | `local-workflow` |

The imported environment already uses the suggested values. If you change a value in one place, change it in the other.

Leave `DIDIT_API_KEY` empty unless you have Didit sandbox keys (see [section 6](#6-testing-against-the-real-didit-sandbox)).

Keep `PLATFORM_FEE_PERCENTAGE=10`. The amount assertions assume a 10% fee.

> **Email:** with `BREVO_API_KEY` or `SMTP_*` set, each run sends real verification emails to `@example.com` addresses. That uses up your Brevo quota. To avoid it, comment the key out while testing. Auth works the same either way, because login does not require a verified email.

### 2.4 Start the API

```bash
pnpm dev
```

Wait for `🚀 Buy Me a Yard API running at http://localhost:3000/api/v1`. Restart the API after any `.env` change.

### 2.5 Import into Postman

1. **Import** → select both JSON files in `docs/postman/`.
2. In the environment dropdown (top right), select **Buy Me a Yard — Local**.
3. Open **View → Show Postman Console**. Some steps print commands and URLs there.

---

## 3. How the collection works

**Authentication.** Every request sends `x-client-type: mobile`, so login and register return the session token in the response body (`data.token`) instead of setting a cookie. The collection saves three tokens and each request uses the right one as a Bearer token:

| Variable | Who |
| :--- | :--- |
| `creatorToken` | The creator registered in this run |
| `supporterToken` | The supporter registered in this run |
| `adminToken` | The seeded super admin (`admin@buymeayard.com` / `AdminPassword123!`) |

**Chaining.** Test scripts save IDs as collection variables for later requests to use: `creatorId`, `creatorMaterialId`, `supportId`, `paymentReference`, `kycSubmissionId`, `payoutId` and others. **Run folders in order.** A request run on its own fails if an earlier request hasn't set what it needs.

**Fresh identities.** The first request, **00 · Setup → Start new test run**, clears every runtime variable and generates a run id. This run gets new emails (`creator+<runId>@example.com`) and a new username (`creator_<runId>`), so you can re-run the collection against the same database without collisions.

**Signed webhooks.** The Paystack and Didit webhook requests build their JSON body in a pre-request script and sign it the way the real provider does:

- Paystack: HMAC-SHA512 in `x-paystack-signature`
- Didit: HMAC-SHA256 in `X-Signature`, plus `X-Timestamp`

The body is sent as `{{paystackBody}}` / `{{diditBody}}`, so the bytes that are signed are exactly the bytes that are sent. Don't edit the body tab of those requests. Change the pre-request script instead.

**Simulated KYC.** Without real Didit keys, the collection plays Didit's part. It sends a signed `status.updated` webhook with a new `session_id`, `vendor_data` set to the creator's profile id, and your `workflow_id`. The API has no row for that session, so it **adopts** it as a new KYC submission and applies the status. This is the same recovery path production uses when a session is created at Didit but the local write fails.

**Money.** All amounts are integers in kobo (₦1 = 100 kobo). With the fixture data, a support of 2 × Ankara at 500,000 is a 1,000,000 total, with a 100,000 platform fee and 900,000 for the creator.

---

## 4. Running it

You can use the Collection Runner or click through requests by hand. Either way, **stop once, after folder 02**, to run the fixtures SQL.

### Option A — Collection Runner (fastest)

1. Right-click **00 · Setup** → **Run folder** → **Run**. Then do the same for **01** and **02**.
   - In the Runner, keep **Persist responses / keep variable values** on, which is the default. Otherwise the saved tokens and ids are lost between runs.
2. In the Postman Console, find the line printed by **Complete onboarding**:
   ```
   >>> NOW RUN (from the repo root):
   docker exec -i buymeayard-postgres psql -U postgres -d buymeayard -v creator=creator_xxxxxx < docs/postman/sql/02-seed-creator-fixtures.sql
   ```
   Run it in a terminal from the repo root. You can also copy `creatorUsername` from the collection's **Variables** tab.
3. Run folders **03** through **12**, in order, the same way.

### Option B — by hand

Open each request in order, click **Send** and check the **Test Results** tab. Run the fixtures SQL between folders 02 and 03. This is slower, but you can read every response.

### Re-running

Start again from **00 · Setup → Start new test run**. You don't need to reset the database. Each run creates a new creator and supporter, but the catalogue and roles are shared.

---

## 5. Folder-by-folder walkthrough

Each subsection lists what the folder does and what to look for. Negative tests are marked **(→ status)**.

### 00 · Setup

1. **Start new test run (health check)** — `GET /health` (outside `/api/v1`). Checks that the database is `up` and generates the run's identities.
2. **Materials catalogue** — `GET /materials`. Must return at least one item. If it's empty, you skipped [2.2](#22-seed-the-materials-catalogue).
3. **Material by slug** / **unknown slug (→ 404)**.

### 01 · Auth — Creator account

1. **Register creator** — `POST /auth/register` with `{ email, password }` only. Returns 201 with `data.token`, `data.user` and `isOnboarded: false`. Saves `creatorToken` and `creatorUserId`.
2. Negative cases:
   - **duplicate email (→ 4xx)**
   - **extra field `role` (→ 400)**: shows that privilege fields can't be smuggled in
   - **short password (→ 400)**
3. **Login creator** — `POST /auth/login`. Saves a new `creatorToken`. **Wrong password (→ 401)**.
4. **Get session** — returns the session user. **Without a token** it returns `data: null` rather than 401, because the route is public.
5. **Resend verification email** — returns 200 whether or not an email provider is configured.
6. **Verify email** — *skipped unless you set `emailVerificationToken`*. The token is a signed JWT that exists only in the email link (`…/verify-email?token=<this>`). You need a working email provider and a real inbox to test it.
7. **Forgot password** → **Reset password** — *reset is skipped unless you set `passwordResetToken`*. Without email, read the token from the database:
   ```bash
   docker exec buymeayard-postgres psql -U postgres -d buymeayard -tAc \
     "SELECT replace(identifier,'reset-password:','') FROM verifications WHERE identifier LIKE 'reset-password:%' ORDER BY \"createdAt\" DESC LIMIT 1;"
   ```
   Paste the result into the `passwordResetToken` collection variable and send **Reset password**. It resets to the same `testPassword`, so the rest of the run is unaffected.
8. **Change password** — **wrong current password (→ 400)**, then a round trip back to the same password.

### 02 · Creator onboarding & profile

1. **Before onboarding:** `GET /users/me` shows `isOnboarded: false` and `roles: []`. `GET /creators/me` **(→ 404)**. `GET /creators/me/kyc` **(→ 403)**, because KYC routes need the CREATOR role, which onboarding grants.
2. **Onboarding validation:** a link with invalid characters **(→ 400)** and a missing name **(→ 400)**.
3. **Complete onboarding** — `PUT /creators/me/onboarding`. Expect `status: PROFILE_CREATED`, `kycStatus: NOT_SUBMITTED` and two social links. Saves `creatorId` (the **profile** id, used by supports, follows and admin routes) and `creatorUsername`. It also **prints the fixtures SQL command** to the console.
4. **Re-run onboarding** — the same link updates the same profile id instead of returning a conflict.
5. `GET /creators/me` and `GET /users/me`: the user now has `isOnboarded: true` and the `CREATOR` role.
6. `PATCH /users/me` with a valid image URL, then an **invalid URL (→ 400)**.
7. **Public profile via personalized link** — `GET /creators/buymeayard%2F<username>` resolves to the same creator.
8. **Discover creators** — `GET /creators?search=<username>` returns **nothing**. Discovery lists only ACTIVE (verified) creators.

> **⏸ Now run `02-seed-creator-fixtures.sql`** with the command from the console.

### 03 · Creator fixtures, supporter & admin

1. **Public creator profile (after SQL fixtures)** — `GET /creators/<username>` now includes the yard menu. The request saves the cheapest ACTIVE item as `creatorMaterialId` and the INACTIVE Adire item as `inactiveCreatorMaterialId`. *If this fails, the fixtures SQL wasn't run for this username.*
2. **Register supporter**, **Login admin**. The admin has `SUPER_ADMIN`.
3. **User privacy:** a supporter viewing the creator's `GET /users/:id` gets no `email` field. The admin gets the full record.
4. **Access control:**
   - no token on `/users/me` **(→ 401)**
   - supporter on `/admin/summary` **(→ 403)**
   - supporter on `/creators/me/kyc` **(→ 403)**

### 04 · Gates before KYC

An unverified creator can't receive or withdraw money:

- Supporter `POST /supports` **(→ 403 `CREATOR_NOT_ACTIVE`)**
- Creator `GET /creators/me/balance` returns `0`
- Creator `POST /creators/me/payouts` **(→ 400 `KYC_REQUIRED`)**

### 05 · KYC — Creator starts verification

1. `GET /creators/me/kyc` returns `NOT_SUBMITTED`, `contributionsEnabled: false`, `canStartSession: true`, and prefill `firstName: "Test"` taken from the profile name.
2. Validation on `POST /creators/me/kyc/session`, all **(→ 400)**:
   - under 18 (the date of birth is computed at run time)
   - impossible date `1995-02-30`
   - country other than `NGA`
   - unknown document type
   - name containing digits or symbols
3. **Start session** — valid details.
   - **Without `DIDIT_API_KEY`:** 503 `KYC_PROVIDER_ERROR`. This is expected, and the test accepts it. Continue to folder 06.
   - **With Didit sandbox keys:** 200 with `verificationUrl` (printed to the console; open it to do the hosted flow) and `sessionToken`. **Resume** with the same details returns `resumed: true` and the same `submissionId`.

### 06 · KYC — Didit webhooks & admin review

1. **Webhook: In Review (new session)** — `POST /webhooks/didit`. The API adopts the session and moves the creator to `NEEDS_REVIEW`. The response must not contain `ignored`.
   - If you get `ignored: "unknown_session"`, `diditWorkflowId` doesn't match `DIDIT_WORKFLOW_ID`.
   - If you get 401, `diditWebhookSecret` doesn't match `DIDIT_WEBHOOK_SECRET`.
2. **Replay** the identical signed body. It returns `status: "already_processed"`: the event is stored once and applied once. *Send this within 5 minutes of step 1, because signatures expire after 5 minutes.*
3. **Bad signature (→ 401)** and **stale `X-Timestamp` (→ 401)**.
4. Creator `GET /creators/me/kyc` returns `NEEDS_REVIEW` with `canStartSession: false`. `POST …/session` **(→ 409 `KYC_UNDER_REVIEW`)**.
5. **Admin review queue** — `GET /admin/kyc` defaults to `NEEDS_REVIEW`, oldest first, with pagination `meta`. Saves `kycSubmissionId`. Also covered:
   - a filtered and paginated query
   - an invalid status **(→ 400)**
   - a creator calling the admin route **(→ 403)**
6. **Admin submission detail** — `GET /admin/kyc/:id` includes the event history. `providerDecision` is `null` with a `providerError` message when Didit isn't configured. Every view is written to the audit log. Also covered: a non-UUID id **(→ 400)** and reject without `reason` **(→ 400)**.
7. **Approve** — use one of these two:
   - **Option A — Admin approve** `POST /admin/kyc/:id/approve`. This calls Didit first, so it succeeds only for a real sandbox session. For a simulated session it returns 502/503 and changes nothing. That's by design, and the test accepts it.
   - **Option B — Webhook: Approved** for the same session. This always works locally. If Option A already approved the submission, this webhook is a harmless no-op.
8. Creator `GET /creators/me/kyc` now returns **`VERIFIED`**, `creatorStatus: ACTIVE` and `contributionsEnabled: true`.
9. Now blocked:
   - `POST …/session` **(→ 409 `KYC_ALREADY_VERIFIED`)**
   - admin approve again **(→ 409 `KYC_INVALID_TRANSITION`)**
10. **Discover creators** now lists the creator.

### 07 · Support & payment (Paystack)

1. Guards on `POST /supports`:
   - self-support with the creator's token **(→ 400 `SELF_SUPPORT_NOT_ALLOWED`)**
   - quantity 0 **(→ 400)**
   - empty items **(→ 400)**
   - inactive material **(→ 400 `MATERIAL_NOT_FOUND`)**
   - a client-supplied `unitPrice` **(→ 400)**: prices are always computed on the server
   - unknown creator **(→ 404)**
2. **Create support (2 yards)** — returns 201 with `status: CREATED`. The server computes `subtotal = 2 × unit price` and a 10% `platformFee`, with `platformFee + creatorAmount = totalAmount`. The item stores a `unitPrice` snapshot. Saves `supportId`.
3. **Initialize payment** — `POST /payments/initialize` returns `authorizationUrl` and `providerReference`. The support becomes `PAYMENT_PENDING` and the payment `PROCESSING`.
   > The Paystack provider is currently a **mock**. It returns a fake checkout URL and doesn't call Paystack, so there is nothing to pay in a browser. The next request simulates Paystack's webhook.
4. **Paystack webhook: bad signature (→ 400 `WEBHOOK_VERIFICATION_FAILED`)**.
5. **Paystack webhook: charge.success** — a signed webhook for `providerReference`. The support becomes **`PAID`**, the payment `SUCCESS`, and the ledger gets two CREDIT entries: the creator's share and the platform fee.
6. **Replay** returns `already_processed`. The creator is not credited twice.
7. **Initialize payment again (→ 400 `PAYMENT_ALREADY_PROCESSED`)**. `GET /supporters/me/supports` shows the paid support.
8. **Create second support** — left unpaid on purpose. Folder 10 tries to pay it after the creator is revoked.

### 08 · Ledger & payouts

1. `GET /creators/me/balance` equals the paid support's `creatorAmount` (900,000 with the fixtures).
2. Payout guards:
   - balance + 1 **(→ 400 `INSUFFICIENT_FUNDS`)**
   - `100.5` **(→ 400 `INVALID_AMOUNT`)**
   - negative **(→ 400 `INVALID_AMOUNT`)**
   - a supporter with no creator profile **(→ 404)**
3. **Request payout of 500,000** — returns 201 with `status: REQUESTED`.
4. **Balance** drops by 500,000 immediately. A DEBIT reservation is written when the payout is requested, so the same funds can't be withdrawn twice.

### 09 · Follows, content, notifications, moderation

1. **Follow** `POST /creators/:creatorId/follow`. Following again is idempotent: `/me/following` shows exactly one row. **Unfollow** returns `count: 1`.
2. **Creator posts (anonymous)** — `GET /creators/:username/posts`. The draft is hidden. The exclusive post has `isLocked: true`, a placeholder body and `media: []`.
3. **Creator posts as the creator** — still locked. This is a **known gap** (see [section 9](#9-known-gaps-found-while-building-this)). The test documents current behaviour and will start failing once the gap is fixed.
4. **Report a post** — returns 201 with `status: PENDING`.
5. **Notifications** — the creator has `KYC_UPDATE` notifications from the KYC transitions.
   - **Mark one read** returns `count: 1`.
   - The supporter marking the creator's notification returns `count: 0`, because notifications are scoped to their owner.
   - **Mark all read** leaves no unread notifications.

### 10 · Admin — dashboard, revoke & re-verify

1. `GET /admin/summary` returns counters. `GET /admin/audit-logs` includes `KYC_SUBMISSION_STATUS_CHANGED`.
2. **Revoke** `POST /admin/kyc/creators/:creatorId/revoke`:
   - a missing reason **(→ 400)**
   - a valid call returns the submission as `REJECTED`
   - revoking again **(→ 409)**

   Revoke is local-first: it works even with Didit unreachable, and the provider update is best-effort. You'll see one logged error about the provider when Didit isn't configured. That's expected.
3. After revoke:
   - KYC status is `REJECTED`, the reason shown is the admin's, and `canStartSession` is `false`
   - `POST …/session` **(→ 403 `KYC_BLOCKED`)**
   - paying the **pending support** from folder 07 **(→ 403 `CREATOR_NOT_ACTIVE`)**: checkout re-checks the creator
   - a new support **(→ 403)**
   - a payout **(→ 400 `KYC_REQUIRED`)**
   - the **balance is unchanged**: revocation freezes withdrawals but doesn't touch earned funds
4. **Unblock** returns `kycBlockedAt: null`. Unblocking again **(→ 409)**. The creator now has `canStartSession: true`.
5. **Re-verify:**
   - **Webhook: Declined (new session)** with a `DOCUMENT_EXPIRED` risk code. The creator sees a safe, readable reason ("Your document has expired…"). Raw provider codes are shown only to admins.
   - **Webhook: Approved (new session)** makes the creator `VERIFIED` and `ACTIVE` again.

### 11 · Logout

Logs out the supporter. Their old token then gets **401** on `/users/me`. Then logs out the creator.

### 12 · Planned endpoints

See the next section.

---

## 6. Testing against the real Didit sandbox

1. In the Didit Console, use your **sandbox** application. Copy the API key, the workflow id and the webhook destination's `secret_shared_key` into `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID` and `DIDIT_WEBHOOK_SECRET`. Put the same workflow id and secret into the Postman variables `diditWorkflowId` and `diditWebhookSecret`.
2. Expose your local API so Didit can reach it. For example, `ngrok http 3000`, then set the Didit webhook URL to `https://<ngrok-host>/webhooks/didit`. The webhook path has **no** `/api/v1` prefix.
3. In folder 05, **Start session** now returns 200. Open `verificationUrl` from the console and complete the hosted flow. Didit then sends real webhooks. Alternatively, trigger approved / declined / in-review test webhooks from the Didit Console.
4. In folder 06, skip the simulated **In Review** webhook. Once Didit puts the session in review, **Option A — Admin approve** returns 200 and Didit echoes the decision back by webhook.
5. The signed simulation requests still work alongside real traffic, because they use their own session ids.

## 7. Planned endpoints (folder 12)

Folder 12 holds endpoints the product needs that don't exist yet. Each currently returns **404**, and its test asserts 404. When someone implements one, its test goes red. That's the prompt to update the request and its assertions. Paths and bodies are **proposals** based on the Prisma schema, not an agreed contract.

| Area | Endpoints | Replaces today |
| :--- | :--- | :--- |
| Creator yard menu | `GET/POST /creators/me/materials`, `PATCH/DELETE /creators/me/materials/:id` | `creator_materials` in `02-seed-creator-fixtures.sql` |
| Creator profile | `PATCH /creators/me`, `GET /creators/me/supports`, `GET /creators/me/followers` | — |
| Payout methods & history | `GET /payouts/banks`, `POST /creators/me/payout-methods/resolve`, `GET/POST/PATCH/DELETE /creators/me/payout-methods`, `GET /creators/me/payouts[/:id]`, `POST /creators/me/payouts/:id/cancel`, `GET /creators/me/transactions` | `payout_methods` in the fixtures |
| Payments | `GET /payments/verify/:reference` | — |
| Posts & media | `POST /media/uploads`, `POST/GET /creators/me/posts`, `GET/PATCH/DELETE /posts/:id`, `POST /posts/:id/publish` | `posts` in the fixtures |
| Supporter | `GET /supporters/me/supports/:id` (owner-scoped) | — |
| Admin | creators, users, catalogue (`/admin/materials`), content reports, payouts queue and approve/reject, refunds, platform ledger | `01-seed-catalogue.sql` |

One entry is marked **[PARTIAL]** rather than planned. `POST /webhooks/paystack` exists but handles only `charge.success`. A `transfer.success` event is acknowledged with 201 and ignored, so payouts stay `REQUESTED` and no `PAYOUT_COMPLETED` or `PAYOUT_REVERSED` ledger entries are ever written.

---

## 8. Troubleshooting

| Symptom | Cause / fix |
| :--- | :--- |
| Every request fails with `ECONNREFUSED` | The API isn't running, or it's on a different port than `baseUrl` / `hostUrl`. |
| `Materials catalogue` is empty | Run `sql/01-seed-catalogue.sql`. |
| `Public creator profile (after SQL fixtures)` fails: "Yard menu seeded" | Run `sql/02-seed-creator-fixtures.sql` with **this run's** `creatorUsername`. |
| Fixtures SQL errors with `division by zero` | The username passed with `-v creator=` doesn't exist. Copy it again from the console or the Variables tab. |
| Didit webhook returns **401** | `diditWebhookSecret` ≠ `DIDIT_WEBHOOK_SECRET`, or you didn't restart the API after editing `.env`. The replay request also returns 401 if sent more than 5 minutes after the original. |
| Didit webhook returns `ignored: "unknown_session"` | `diditWorkflowId` ≠ `DIDIT_WORKFLOW_ID`, or `DIDIT_WORKFLOW_ID` is empty. |
| Didit webhook returns `ignored: "sandbox_event"` | The API runs with `NODE_ENV=production`, which rejects sandbox events. Use `development`. |
| Paystack webhook returns **400** `WEBHOOK_VERIFICATION_FAILED` | `paystackWebhookSecret` ≠ `PAYSTACK_WEBHOOK_SECRET`. If `PAYSTACK_WEBHOOK_SECRET` is unset, the API falls back to `PAYSTACK_SECRET_KEY`. |
| Any KYC request returns 500 | The KYC migration isn't applied. Run `pnpm db:migrate`. |
| `Login admin` returns 401 | The seed hasn't run. Run `cd apps/api && pnpm prisma db seed`. |
| Tokens or ids "empty" mid-run | Folders were run out of order, or the Runner wasn't keeping variable values. Restart from **00 · Setup**. |
| Support amount assertions fail | `PLATFORM_FEE_PERCENTAGE` isn't 10. |
| `KYC_ATTEMPT_LIMIT_REACHED` (429) | More than `KYC_MAX_SESSIONS_PER_DAY` real sessions in 24h for one creator. Start a new run, which creates a new creator. |
| No Didit keys and no way to set the webhook secret | Run `sql/99-force-verify-creator.sql` in place of folder 06. It skips the KYC state machine, so no submission, notification or audit entry is written. The notification test in folder 09 and the revoke tests in folder 10 fail as a result. |

---

## 9. Known gaps found while building this

These are current behaviours, not problems with the collection. Tests that cover them assert today's behaviour and say so in their descriptions.

1. **Exclusive posts are always locked, even for the owner.** `GET /creators/:username/posts` is `@Public()`. The global `AuthGuard` returns early on public routes without resolving the session, so `@CurrentUser('id')` is always `undefined` there, and entitlement checks never see a viewer.
2. **`GET /supports/:id` isn't owner-scoped.** Any signed-in user can read any support, including its items and payment.
3. **Initializing payment twice for the same support will likely fail with a 500.** `payments.supportId` is `@unique`, but `initializePayment` allows a `PAYMENT_PENDING` support and always creates a new payment row. A supporter who abandons checkout and retries would hit a unique-constraint error. The collection doesn't exercise this path.
4. **The Paystack provider is a mock.** Neither `initializePayment` nor `verifyPayment` calls Paystack, and nothing exposes `verifyPayment`.
5. **Payouts never progress past `REQUESTED`.** Nothing sends the transfer, and transfer webhooks are ignored.
6. **New users get no roles at registration.** The seed's comment says "every user is a supporter by default", but only the admin gets `SUPPORTER`. Nothing currently checks for that role, so it has no effect yet.
7. **Admin approve/reject depend on Didit being reachable**, which is deliberate: the decision goes to the provider first. Revoke and unblock work without Didit.
