# KYC Implementation (Didit)

This document explains how creator identity verification (KYC) works in the backend, why it was built this way, and how it was verified. For the client-facing contract (endpoints, payloads, screens) see [KYC_INTEGRATION.md](./KYC_INTEGRATION.md).

## 1. Why

Creators receive money (supports) and withdraw it (payouts). Before this change:

- Payouts required `kycStatus === 'VERIFIED'`, but nothing could ever set it. `POST /creators/me/kyc` was a stub: it stored any JSON body and left the creator `PENDING` forever.
- Creator discovery lists only `ACTIVE` creators, and nothing ever set `ACTIVE`, so the public creator list was always empty.
- Anyone could receive supports without verifying.

Now creators verify with Didit. Approval publishes the creator (`ACTIVE`), which enables contributions, discovery and payouts.

## 2. Decisions

| Decision | Choice | Reason |
|---|---|---|
| Provider | **Didit**, behind a provider-agnostic `KycProvider` interface (same pattern as `PaymentProvider`) | Free tier: 500 checks/month each for document OCR, passive liveness and face match |
| Checks | Document OCR + passive liveness + face match | All free. NIN/BVN registry lookup is paid ($0.20/$0.35), so it's out of scope: the NIN is read from the document but not checked against NIMC |
| Integration style | **Didit SDK sessions** (web `@didit-protocol/sdk-web`, mobile `@didit-protocol/sdk-react-native`), not standalone APIs | Standalone APIs have no free tier, accept uploaded images (easy to spoof), route ID images through our servers, and lose Didit's decision engine, review queue and webhooks |
| UI | Our screens for details, review and results; Didit's themed UI for capture only | Keeps our design while capture stays live and anti-spoofed. What the creator types is sent as `expected_details`, so Didit flags mismatches |
| What KYC gates | Contributions, public listing, payouts | Matches the Figma: "verification is required before you can publish your page and receive contributions" |
| Approval | Auto-publishes (creator → `ACTIVE`) | Product decision |
| Review | Didit decides automatically; "In Review" cases go to our admin queue with approve / reject / revoke | Humans only handle borderline cases |
| Revocation | **Sticky**: blocks re-verification until an admin lifts it | Otherwise a revoked creator could simply verify again |
| Notifications | In-app only (for now) | The mailer lives inside `better-auth.ts` and isn't reusable yet |
| Branding | Free Console theming; no paid white-label | Cost |

## 3. Architecture

```
Web / RN app                         API                                       Didit
────────────                         ───                                       ─────
GET  /creators/me/kyc  ───────────▶  status (+ reconcile if a result is overdue)
POST /creators/me/kyc/session ────▶  KycService.startSession ── createSession ─▶ /v3/session/
     ◀── verificationUrl / sessionToken
Didit SDK (document + selfie) ─────────────────────────────────────────────────▶ decision
                                     POST /webhooks/didit  ◀── signed status.updated ─
                                     verify → KycEvent (idempotent) → transition
Admin portal ─────────────────────▶  /admin/kyc … ── update-status ────────────▶ /v3/session/{id}/update-status/
```

**Layers**

- **`infrastructure/kyc/`** knows Didit and nothing about our domain:
  - `kyc-provider.interface.ts`: the `KYC_PROVIDER` token and the provider contract.
  - `didit/didit.provider.ts`: the HTTP client. It uses a 10s timeout and `x-api-key`. Errors surface as 502 `KYC_PROVIDER_ERROR`; Didit's error bodies are never forwarded to clients. A 404 on the decision endpoint is reported as "no status".
  - `didit/didit-signature.ts`: webhook signature verification (pure).
  - `didit/didit.mapper.ts`: status mapping, the minimized decision summary and payload redaction (pure).
- **`modules/kyc/`** is the domain:
  - `kyc-state.ts`: pure state rules (transition table, derivations).
  - `kyc-transition.service.ts`: **the only code that changes KYC state**.
  - `kyc.service.ts`: creator flows, webhook and reconciliation.
  - `kyc-admin.service.ts`: review queue, decisions, revoke and unblock.
  - `kyc-reasons.ts`: user-safe rejection messages.
  - `kyc-validation.ts`: date-of-birth rules.
  - Controllers and DTOs.

**Endpoints**

| Route | Guard | Purpose |
|---|---|---|
| `GET /api/v1/creators/me/kyc` | `CREATOR` | Status, prefill, latest attempt |
| `POST /api/v1/creators/me/kyc/session` | `CREATOR` | Start or resume verification |
| `POST /webhooks/didit` | Public, HMAC signature | Didit results |
| `GET /api/v1/admin/kyc`, `GET /api/v1/admin/kyc/:id` | `ADMIN`/`SUPER_ADMIN` | Queue, detail |
| `POST /api/v1/admin/kyc/:id/approve`, `POST /api/v1/admin/kyc/:id/reject` | `ADMIN`/`SUPER_ADMIN` | Review decisions |
| `POST /api/v1/admin/kyc/creators/:creatorId/revoke`, `POST /api/v1/admin/kyc/creators/:creatorId/unblock` | `ADMIN`/`SUPER_ADMIN` | Revoke (and block), lift the block |

The old `POST /creators/me/kyc` (which stored arbitrary JSON) is removed. Creator and admin detail responses carry `Cache-Control: no-store`.

## 4. Data model

Migrations `20261001120000_kyc_didit_integration` and `20261002120000_kyc_constraints`:

- **`kyc_submissions`**: one row per verification attempt.
  - `providerReference` holds the Didit session ID, with `@@unique([provider, providerReference])`.
  - New columns: `providerStatus`, `workflowId`, `environment`, `claimedDetails` (what the creator typed), `decisionSummary` (minimized, see §7), `rejectionReason` (user-safe), `providerUpdatedAt` (the out-of-order guard; provider clock only), `lastSyncedAt`, `completedAt`, and reviewer fields.
  - Indexes on `(creatorId, createdAt)` and `status`.
- **`kyc_events`** (new): one row per processed webhook, with `@@unique([provider, providerEventId])` for idempotent delivery. It stores a **redacted** payload.
- **`creator_profiles`**: `kycVerifiedAt`, `kycBlockedAt` and `kycBlockedReason` (new).
- **Data cleanup**:
  - Placeholder rows written by the old stub (`provider = 'DEFAULT_KYC'`, `PENDING`) become `CANCELLED`.
  - Creators the stub marked `PENDING` return to `NOT_SUBMITTED`.
  - `VERIFIED` rows are never touched.
- **Audited demotion** (`kyc_constraints`): any creator that is `ACTIVE` without `VERIFIED` (only possible by hand-editing data) is moved to `PROFILE_CREATED`, because contributions are now gated on `ACTIVE`. Each demoted row gets an `audit_logs` entry (`CREATOR_DEMOTED_BY_MIGRATION`, with its previous state), and the migration prints the count, so nothing changes silently.
- **Database constraints** (`kyc_constraints`). Postgres rejects invalid values from *any* code path or manual update:
  - `kyc_submissions_status_check`, `creator_profiles_kyc_status_check` and `creator_profiles_status_check` limit the columns to the known enum values;
  - `creator_profiles_active_requires_verified` enforces the money invariant `status <> 'ACTIVE' OR "kycStatus" = 'VERIFIED'` in the database itself.

  Unknown existing values make the deploy fail loudly rather than being rewritten. Prisma doesn't model CHECK constraints, so `migrate diff` shows no drift; the constraints live only in the migration SQL.

Status columns stay plain strings with TypeScript enums in `@buymeayard/types`, matching the existing convention. `KycStatus` (creator level) gains `EXPIRED`. `KycSubmissionStatus` (attempt level) has `CREATED`, `IN_PROGRESS`, `NEEDS_REVIEW`, `VERIFIED`, `REJECTED`, `RESUBMISSION_REQUIRED`, `ABANDONED`, `EXPIRED`, `KYC_EXPIRED` and `CANCELLED`. The package also adds `KycDocumentType`, `KycProviderName` and `KycReviewSource`, plus request/response types in `kyc.ts`.

## 5. State machine

**Core invariant: a creator is `ACTIVE` only if their `kycStatus` is `VERIFIED`.** Every change re-derives the creator from their *latest* submission. No path can leave an unverified creator accepting money, and a blocked (revoked) creator is always derived as `REJECTED`.

Didit label → submission status. Matching is case- and separator-insensitive. An unknown label maps to `null`, which means "change nothing".

| Didit | Submission | Creator `kycStatus` | Creator `status` |
|---|---|---|---|
| Not Started | CREATED | PENDING | KYC_PENDING |
| In Progress / Awaiting User | IN_PROGRESS | PENDING | KYC_PENDING |
| Resubmitted | RESUBMISSION_REQUIRED | PENDING | KYC_PENDING |
| In Review | NEEDS_REVIEW | NEEDS_REVIEW | KYC_PENDING |
| Approved | VERIFIED | VERIFIED | **ACTIVE** |
| Declined | REJECTED | REJECTED | PROFILE_CREATED |
| Kyc Expired | KYC_EXPIRED | EXPIRED | PROFILE_CREATED |
| Abandoned / Expired / (ours) Cancelled | ABANDONED / EXPIRED / CANCELLED | previous outcome (NOT_SUBMITTED, REJECTED or EXPIRED) | follows |

`SUSPENDED`, `BANNED` and `DEACTIVATED` creators are never changed by KYC.

Allowed submission transitions (anything else is ignored and logged):

| From | To |
|---|---|
| CREATED | anything except CREATED |
| IN_PROGRESS, RESUBMISSION_REQUIRED | forward states only |
| NEEDS_REVIEW | VERIFIED, REJECTED, RESUBMISSION_REQUIRED |
| VERIFIED | REJECTED (revoke / reviewer decline), KYC_EXPIRED |
| REJECTED, ABANDONED | VERIFIED, REJECTED, RESUBMISSION_REQUIRED (reviewer override) |
| EXPIRED, KYC_EXPIRED, CANCELLED | nothing (a new session is required) |

**Required-checks policy.** A provider "Approved" (from a webhook or a reconcile) is only accepted when every check in `KYC_REQUIRED_CHECKS` (default `ID_VERIFICATION,LIVENESS,FACE_MATCH`) is individually `Approved` in the decision. Otherwise the submission becomes `NEEDS_REVIEW`, and the missing checks are recorded in `decisionSummary.missingRequiredChecks` for the admin. So if someone removes Face Match from the workflow in the Console, nobody gets auto-verified without proof that the selfie matches the ID. Admin decisions are deliberate and bypass the policy. Approvals made by reviewers in Didit's own Console also land in our queue, so make decisions in our admin portal.

Three guards sit on top of the table:

1. **Staleness is checked first.** Webhook events older than the last applied *provider* timestamp are dropped, including same-status events, so stale data can't overwrite newer data.
2. **Admin actions state the status they expect to change from** (`expectedFrom`) and are checked under the lock. They also advance the ordering guard, so an older provider event can't undo them.
3. **Reconciliation never writes the ordering timestamp.** The decision endpoint has no event time, and our clock must not be compared with Didit's.

Every change writes, in one transaction: the submission, the creator, `audit_logs` entries (`KYC_SUBMISSION_STATUS_CHANGED`, `CREATOR_KYC_STATUS_CHANGED`) and, for creator-facing outcomes, a `KYC_UPDATE` notification.

## 6. Key flows

**Start / resume** (`startSession`):

1. Checks: the creator exists, isn't suspended, **isn't blocked**, isn't already verified or in review, and is aged 18+.
2. If an attempt is open, the service first **asks Didit for its real status**. A lost webhook could mean it's already in progress, approved or declined.
3. Same details: Didit's create call returns the same session (it's idempotent per creator), so the creator resumes without using an attempt. If Didit instead returns a *new* session, the old one finished in the meantime. We sync it, and if that verified the creator, we delete the new session and return 409.
4. Changed details: a session the user hasn't started is deleted and marked `CANCELLED`. Mid-capture returns `409 KYC_SESSION_IN_PROGRESS`.

   The order is deliberately **Didit delete first, then the local cancel**. Didit returns the same unfinished session for the same creator, so a local-first cancel followed by a failed Didit delete would hand the *old* session (with stale details) back on the next start. With this order, a failure is recoverable: if the delete succeeds but the local write fails, the row stays `CREATED`. The retry then sees the session as gone (decision 404 → no status), deletes again (404 tolerated), and cancels. A unit test covers this.
5. Limits and callback: `KYC_MAX_SESSIONS_PER_DAY` (default 5) protects the free tier. It's checked once as a fast path, then **re-checked under the creator lock** right before the insert, so concurrent starts can't exceed it. If the in-lock check fails, the just-opened Didit session is deleted and the request gets 429. The callback URL is chosen by the server (app deep link for `x-client-type: mobile`, otherwise the creator portal), so there's no open redirect.
6. The submission is upserted by Didit session ID, under the creator lock.

**Webhook** (`handleWebhook`):

1. Verify the signature (§7). Invalid → 401.
2. Ignore unsupported event types, sandbox events in production, and unrecognised statuses.
3. In one transaction:
   - Duplicate check.
   - Find the submission, or *adopt* an unknown session. Adoption only happens if `vendor_data` is one of our creators **and** the workflow ID is ours; it re-checks after locking, in case `startSession` created the row meanwhile.
   - **Ineligible creators are never adopted** (suspended, banned, deactivated, or blocked after a revocation). The event is still recorded (for idempotency) and audited as `KYC_EVENT_IGNORED_INELIGIBLE_CREATOR`, and the response is `ignored: creator_ineligible`. For sessions we already know, the submission keeps mirroring Didit, but such creators' status never changes.
   - A `vendor_data` mismatch is ignored.
   - Lock creator → submission, then re-check for duplicates.
   - Insert the `KycEvent`, then run the transition.
4. Only a unique violation on the event ID counts as "already processed". Any other failure rolls everything back and returns 500, so Didit retries.

**Reconcile**: Didit retries a failed webhook only twice. So `GET /creators/me/kyc` pulls the decision from Didit when a non-final attempt hasn't synced for 60s. Provider failures there are swallowed, so status reads keep working.

**Admin**:

- **Approve / reject** apply only to the creator's latest submission:
  - approve: from in review or rejected, and not if the creator is blocked;
  - reject: from in review.
- Didit is updated **first**. If that fails, nothing changes locally. If it succeeds but our write fails, Didit's own `status.updated` webhook re-applies the change.
- The current Didit status is read first, and the update is skipped when Didit already agrees. That's the case when our policy held back a Didit "Approved" for review; Didit would otherwise reject an update to its current status.
- If a concurrent decision changed the submission, the admin gets 409.
- If Didit's echo webhook arrives before our write, the reviewer attribution is still recorded.
- **Revoke** is **local-first**: in one transaction it blocks the creator (`kycBlockedAt`), rejects the verified submission and delists the creator. Didit is told afterwards, best-effort. Cutting a creator off must not depend on Didit being reachable, and while blocked the creator can never be re-verified, even if Didit still says Approved.
- **Unblock** lifts the block. The creator stays `REJECTED` and can verify again.
- **Detail** fetches the live Didit decision and returns it as an **explicit allowlisted view** (`toAdminDecisionView`). The raw Didit payload never leaves the provider layer. The view contains:
  - ID check: status, document type, last 4 of the document number, names, date of birth, expiry, issuing state, nationality, and front/back/portrait images;
  - liveness: status, method, score and reference image;
  - face match: status, score and both images;
  - warning codes.

  Addresses, MRZ, barcodes, full ID numbers and cross-session matches are dropped. Image URLs are short-lived and never stored. Every view is audit-logged.
- **Self-heal.** If the detail view finds that Didit's status differs from ours (a lost webhook, or our write failing after an admin decision reached Didit), it applies Didit's state using the decision it already fetched. So provider/local divergence is repaired by any of: Didit's webhook, the creator's status check, or an admin opening the case.

## 7. Security & privacy

- **Webhook signatures**:
  - Accepted: `X-Signature-V2` (HMAC-SHA256 over canonical JSON: sorted keys, compact, unescaped Unicode) or `X-Signature` (HMAC over the exact raw bytes; `rawBody: true`).
  - Rejected: the deprecated `X-Signature-Simple`, which doesn't cover the decision.
  - Comparisons are constant-time.
  - Timestamps have a 300s tolerance, checked on the `X-Timestamp` header **and** on the signed body `timestamp`. The header isn't covered by the signature, so an old body could otherwise be replayed with a fresh header. Didit re-stamps `timestamp` on each retry, so genuine retries still pass.
- **No images or media URLs are stored**; Didit holds them.
  - `decisionSummary` keeps only document type, issuing country, the last 4 characters of the document number, names, date of birth, per-check status and score, and warning codes.
  - `kyc_events.payload` keeps only the envelope, statuses and risk codes.
- **No session tokens are stored.** Resuming works by calling Didit again.
- **Log redaction**: `HttpExceptionFilter` used to log every failing request body, including passwords on failed logins. It now omits bodies on `/webhooks/*` and every `/kyc` route, and masks `password`, `newPassword`, `currentPassword`, `token`, `secret` and `dateOfBirth` everywhere.
- **Rejection messages** are user-safe and deliberately vague about fraud signals (duplicates, tampering). Raw codes are shown to admins only.
- **Authorization**: creator routes need `CREATOR`; admin routes need `ADMIN`/`SUPER_ADMIN`. `RolesGuard` isn't global, so it's applied per controller.

## 8. Concurrency

Two webhooks for one session can arrive together, and users double-tap buttons.

- **Lock order.** All state changes lock rows with `SELECT … FOR UPDATE` in one fixed order: **creator, then submission**. This must also hold for writes that only *touch* the submission row. Inserting a `kyc_events` row takes a share lock on its parent through the foreign key, so the webhook takes both locks before inserting the event.
- **No network calls inside database transactions**, ever.
- **Duplicate events** either see the committed event after waiting for the lock, or hit the unique index. Both return `already_processed`.
- **Payouts lock the creator row too.** They re-check KYC, status and balance under the lock (§9).
- **The attempt limit is re-checked under the creator lock** (§6).
- **The database enforces the invariant** (§4), so even a future code path that bypasses the transition engine can't make an unverified creator `ACTIVE`.
- **CI runs the real-Postgres suite** (`.github/workflows/ci.yml`): `prisma migrate deploy` on the CI database, then `test/kyc-concurrency.e2e-spec.ts`. That covers row locks, deadlocks, unique and CHECK constraints, and proves the migrations apply to a clean database on every PR.

## 9. Money gating (outside the KYC module)

- `SupportsService.createSupport`: the creator must be `ACTIVE`, otherwise 403 `CREATOR_NOT_ACTIVE`.
- `PaymentsService.initializePayment`: the same check again at checkout, which covers a revocation between support creation and payment.
- The Paystack `charge.success` webhook is **not** gated: money that was already captured must be recorded in the ledger. It can't leave the platform without passing the payout checks.
- `PayoutsService.requestPayout`:
  - Requirements: `kycStatus = VERIFIED` **and** `status = ACTIVE`, so a suspended creator can't withdraw, and the amount must be a positive integer in minor units.
  - Inside the transaction it locks the creator row and re-checks KYC, status and balance. This closes a race with revocation, and an existing double-spend race where two concurrent requests could both pass the balance check.

## 10. Configuration & setup

| Variable | Notes |
|---|---|
| `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET`, `CREATOR_FRONTEND_URL` | **Required when `NODE_ENV=production`**; the app refuses to boot without them |
| `DIDIT_BASE_URL` | Default `https://verification.didit.me` |
| `KYC_MOBILE_CALLBACK_URL` | Default `buymeayard://kyc/complete` |
| `KYC_MAX_SESSIONS_PER_DAY` | Default 5 |
| `KYC_REQUIRED_CHECKS` | Default `ID_VERIFICATION,LIVENESS,FACE_MATCH`. Must be a non-empty subset |

**Out of credits.** A live application needs available credits to create sessions; sandbox applications skip this check. When Didit replies "not enough credits", the API returns 503 `KYC_UNAVAILABLE` ("temporarily unavailable") and logs `DIDIT OUT OF CREDITS` at ERROR. The free allowance is 500 per check per month (ID Verification, Passive Liveness and Face Match); after that, usage is billed from prepaid credits.

**Didit Console setup:**

1. **Workflow**: ID Verification → Passive Liveness → Face Match → automatic decision.
   - Country: NGA. Accept ID card, passport and driver's licence.
   - Allow documents with no expiry date (NIN slips have none).
   - Turn duplicate detection on.
   - Send name/DOB mismatches to In Review.
   - Theme it with our branding.
2. **Webhook destination (v3)**: `https://<api-host>/webhooks/didit`, with events `status.updated` and `data.updated`. Its secret goes in `DIDIT_WEBHOOK_SECRET`.
3. **Applications**: keep separate sandbox and live applications. If you're behind Cloudflare, allowlist `18.203.201.92`.

### Testing locally with a live Didit application

Locally, the app runs with `NODE_ENV=development` and a **live** application's key, using the free workflow (ID Verification + Passive Liveness + Face Match).

- **Real documents and selfies, real quota.** Each completed attempt uses one of each free check. Sessions that are never started cost nothing. Live sessions accept `environment: "live"` webhooks; sandbox events are only rejected in production.
- **Webhooks need a public URL.** Run `cloudflared tunnel --url http://localhost:3000` (or `ngrok http 3000`) and set the destination to `https://<tunnel>/webhooks/didit`. Without a tunnel, leave `DIDIT_WEBHOOK_SECRET` empty: `GET /creators/me/kyc` pulls the result from Didit once a pending attempt is more than 60s old.
- **Exercising the admin review queue on live.** Borderline results are hard to produce on purpose. Instead, temporarily switch Face Match off in the workflow and complete a verification. Didit approves it, and our policy holds it as `NEEDS_REVIEW` because Face Match is missing. Approve or reject it via `/admin/kyc`, then switch Face Match back on.

## 11. Verification performed

| Check | Result |
|---|---|
| Unit tests (Jest) | **361 passing** across the whole API (72 before this work). See the breakdown below |
| Mutation checks | Deliberately broke each of these in turn; tests failed every time: the `ACTIVE ⇒ VERIFIED` invariant, the revocation block, the `expectedFrom` guard, stale-before-same-status ordering, and the required-checks policy |
| Real-Postgres suite (`test/kyc-concurrency.e2e-spec.ts`, **runs in CI**) | 6/6 passing, including the database rejecting `ACTIVE` without `VERIFIED` and unknown statuses. Removing the lock-order fix makes it fail with a real deadlock (`40P01`), so it guards the regression |
| DB constraints on seeded data | The audited demotion wrote one audit entry and printed the count. Five invalid direct `UPDATE`s were each rejected by the right constraint, and the app's single-statement revoke update was allowed |
| Postman suite from a clean database | Fresh DB → migrations → seed → catalogue → collection run (newman), with the fixtures SQL after folder 02. **282/282 assertions passed**, 0 request errors. Didit was deliberately not configured, so no live sessions were created; decisions were simulated with signed webhooks |
| Migration on real Postgres 16 (throwaway DB) | `prisma migrate deploy` applies cleanly; `prisma migrate diff` shows **no drift**; the data cleanup was verified on seeded stub rows |
| App boot (real `AppModule`, DB stubbed) | DI resolves; all 9 KYC routes are mapped; `/webhooks/didit` sits outside `api/v1` |
| HTTP webhook checks | Valid V2 (Unicode body) → 200; valid raw signature → 200; forged → 401; stale → 401; anonymous creator/admin calls → 401 |
| `pnpm lint`, `pnpm test`, `pnpm build` (the CI steps) | Pass. Test helpers are excluded from `dist/` |
| Independent adversarial review | See below |

The unit tests cover:

- Signature verification: hand-written canonical vectors, tampering, replay and the deprecated header.
- The status mapper: all 10 labels, their variants, and unknown → null.
- The full state and invariant matrix.
- Rejection reasons and DOB rules.
- Service flows on an in-memory Prisma fake, including regressions for every review finding.
- The supports, payments and payouts gates, env validation, and log redaction.

**What the verification found and fixed:**

1. **Deadlock** (found by the real-database run and, independently, by the review). The webhook inserted the event row, which takes a share lock on the submission, before locking the creator. Two simultaneous webhooks deadlocked and Postgres killed one, often the "Approved" one, which could strand a verified creator. **Fix:** take the canonical locks before any write.
2. **Revocation could be undone** by the creator re-verifying. **Fix:** sticky block (`kycBlockedAt`) plus an admin unblock endpoint. Blocked creators can't verify, and Didit approvals can't re-verify them.
3. **Suspended creators could withdraw**, because payouts checked only `kycStatus`. The check also raced with revocation, and concurrent payouts could overdraw. **Fix:** require `ACTIVE`, and lock and re-check under the transaction.
4. **Any unique violation was treated as a duplicate webhook**, silently dropping real events. **Fix:** only the event-ID constraint counts. Adoption re-checks after locking and fills in missing claimed details.
5. **Our clock was mixed with Didit's in the stale guard**, which could drop fresh decisions. **Fix:** reconcile no longer writes the ordering timestamp; admin actions advance it.
6. **Admin decisions had no expected starting state**, so concurrent reviewers could diverge. **Fix:** `expectedFrom` is enforced under the lock, with a 409 on conflict. Attribution is kept when Didit's echo arrives first.
7. **Resuming could demote a creator Didit had already approved.** **Fix:** reconcile before branching, and discard a superseding session if the old one was decided.
8. **A 404 from Didit's decision endpoint returned 502 forever.** **Fix:** treated as "no status".
9. **Smaller fixes**:
   - Stale same-status events no longer overwrite data.
   - `CREATOR_FRONTEND_URL` is required in production (it previously defaulted to localhost).
   - The `ACTIVE`-without-`VERIFIED` migration guard.
   - `no-store` on sensitive responses.
   - The page-size bound.
   - The "verified" notification copy is neutral.
   - The test fake now returns copies (it had been hiding a wrong `previousState` in audit logs).
   - A time-dependent test fake clock.

**PR #38 automated review (second round):**
- The attempt limit is now atomic (in-lock re-count).
- Adoption is refused for ineligible creators.
- The admin detail returns an allowlisted view, and admin detail self-heals divergence.
- Database CHECK constraints are in, plus the audited demotion.
- The concurrency suite runs in CI.
- The seed refuses default admin credentials in production.
- The Postman suite is updated for slug-based onboarding.

The cancel ordering was kept by design (see §6, with a test proving recovery).

**A review finding confirmed not to be a bug**: the reviewer worried that the signed-body timestamp check would reject Didit retries. Didit's webhook docs state `timestamp` is "Refreshed on each retry", so retries pass.

## 12. Known limitations & follow-ups

- **Not yet run against the live Didit sandbox.** Next step: run approved, declined and in-review sessions end to end, and capture one real signed webhook as a known-good test vector.
- **Paper NIN slip support is unconfirmed.** Didit's docs list Nigerian ID cards; confirm the slip is accepted.
- **`GET /creators/me/kyc` can take up to 10s if Didit is down** (the reconcile timeout).
- **No scheduled reconciliation job or durable outbox** (QueuesModule is empty). Provider/local divergence after an admin decision is repaired by Didit's webhook, the creator's status check, or the admin detail view's self-heal. Follow-up: a durable outbox and retry worker for provider calls, so recovery doesn't depend on those triggers.
- **Emails aren't sent**; notifications are in-app only.
- **Out of scope**: NIN/BVN registry lookup, bank-account name matching, admin "request resubmission", and NDPR erasure via Didit's delete endpoint.
- **Existing issues noticed but not fixed here**:
  - The Paystack provider is mocked, and its signature comparison isn't constant-time.
  - The ledger write happens outside the payment transaction.
  - `GET /supports/:id` and `POST /payments/initialize` have no ownership checks.
  - `GET /creators/:slug/posts` never sees the viewer.

## 13. File map

```
packages/types/src/enums.ts, kyc.ts          shared enums + request/response types
apps/api/prisma/schema.prisma, migrations/20261001120000_kyc_didit_integration/, migrations/20261002120000_kyc_constraints/
apps/api/src/config/env.validation.ts        Didit env vars (required in production)
apps/api/src/infrastructure/kyc/             provider interface, Didit client, signature, mapper
apps/api/src/modules/kyc/                    state rules, transition engine, services, controllers, DTOs
apps/api/src/modules/supports|payments|payouts/  contribution + payout gating
apps/api/src/common/filters/http-exception.filter.ts  log redaction
apps/api/test/kyc-concurrency.e2e-spec.ts    real-Postgres concurrency + constraint suite (runs in CI)
apps/api/prisma/seed.ts                      refuses default admin credentials in production
docs/KYC_INTEGRATION.md                      client integration guide
```
