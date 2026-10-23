# KYC Integration Guide (Web & React Native)

Creators verify their identity with [Didit](https://docs.didit.me) before their page is published and they can receive contributions or payouts. Our screens collect the creator's details; Didit's SDK captures the document and selfie; the backend decides the outcome.

```
Intro → Step 1: Confirm details → Step 2: Choose document → Review
      → POST /creators/me/kyc/session → Didit SDK (document + selfie)
      → Poll GET /creators/me/kyc → In progress / Verified / Failed
```

All endpoints need the usual authenticated creator session (cookie on web, Bearer token on mobile). Responses use the standard envelope: `{ "data": ..., "meta": {} }` on success and `{ "error": { "code", "message" } }` on failure. Types are exported from `@buymeayard/types` (`KycStatusResponse`, `StartKycSessionRequest`, `StartKycSessionResponse`, `KycStatus`, `KycDocumentType`).

## 1. Get the current status

`GET /api/v1/creators/me/kyc`

```json
{
  "kycStatus": "NOT_SUBMITTED",
  "creatorStatus": "PROFILE_CREATED",
  "isKycCompleted": false,
  "contributionsEnabled": false,
  "canStartSession": true,
  "prefill": { "firstName": "Mariam", "lastName": "Omiteru" },
  "latestSubmission": null
}
```

Choose the screen from `kycStatus`:

| `kycStatus` | Screen |
|---|---|
| `NOT_SUBMITTED` | Intro ("Help us verify your identity") |
| `PENDING` | Verification in progress (or resume, see §3) |
| `NEEDS_REVIEW` | Verification in progress (a person is reviewing it) |
| `VERIFIED` | Your identity is verified |
| `REJECTED` | We couldn't verify your identity. Show `latestSubmission.rejectionReason` and offer "Review and try again" |
| `EXPIRED` | Verification expired. Offer to verify again |

When `canStartSession` is `false` and `kycStatus` is `REJECTED`, the account is blocked by an admin. Show "contact support" instead of "try again".

Use `prefill` for the legal name on Step 1. Use `isKycCompleted` (`kycStatus === "VERIFIED"`) for "identity verified" badges, `contributionsEnabled` for the dashboard's "Contributions" card and `creatorStatus` for "Profile status" (`ACTIVE` = published).

Reading the status can also sync it: if an attempt is still open and Didit hasn't been checked for more than 60 seconds, the backend asks Didit for the current decision before responding. If Didit is down, the call still returns the stored status (it can take up to ~10s in that case). Responses are `Cache-Control: no-store`.

## 2. Start verification

Collect Steps 1–2 and show the Review screen **before** calling this, because Didit submits as soon as capture finishes. Call it from the Review screen's "Submit for verification" button.

`POST /api/v1/creators/me/kyc/session`

Mobile must send the header `x-client-type: mobile`, so the flow returns to the app's deep link (`buymeayard://kyc/complete`) instead of the web portal.

```json
{
  "firstName": "Mariam",
  "lastName": "Omiteru",
  "dateOfBirth": "1995-10-12",
  "country": "NGA",
  "documentType": "NATIONAL_ID"
}
```

**Every field is optional.** Send the details you collected, or send `{}` to let Didit's hosted UI handle document choice and data extraction. Whatever you send is passed to Didit as the *expected* details, and Didit flags a mismatch with the document. That is why the Step 1–2 screens are worth keeping: a typo-free legal name and date of birth reduce rejections.

- `firstName`, `lastName`: 1–100 characters, letters plus `'`, `.`, `-` and spaces.
- `dateOfBirth`: `YYYY-MM-DD`. The Figma picker shows DD/MM/YYYY, so convert before sending. **If sent**, the creator must be at least 18 (and not in the future), otherwise `400 VALIDATION_ERROR`. If omitted, the backend does not check age itself; Didit's workflow does, and a failure comes back as a rejection.
- `country`: only `NGA` for now. Any other value is a `400`.
- `documentType`: `NATIONAL_ID` (NIN card or slip), `PASSPORT`, `DRIVERS_LICENCE` or `VOTERS_CARD`. Didit receives `NATIONAL_ID` and `VOTERS_CARD` as an ID card.

Sending the same details again resumes the open session (see §3). Sending *different* details replaces the session only if the creator hasn't started capture yet.

Response:

```json
{
  "submissionId": "7c1e…",
  "status": "CREATED",
  "verificationUrl": "https://verify.didit.me/session/…",
  "sessionToken": "…",
  "resumed": false
}
```

Errors:

| HTTP | `code` | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid details (the message is safe to show) |
| 403 | `FORBIDDEN` | Account suspended or banned |
| 403 | `KYC_BLOCKED` | An admin revoked this creator's verification. Show "contact support" and don't offer a retry |
| 404 | `CREATOR_NOT_FOUND` | Onboarding not finished |
| 409 | `KYC_ALREADY_VERIFIED` / `KYC_UNDER_REVIEW` | Nothing to do; refresh the status |
| 409 | `KYC_SESSION_IN_PROGRESS` | The creator changed their details mid-capture. They must finish the current attempt |
| 429 | `KYC_ATTEMPT_LIMIT_REACHED` | Too many attempts today |
| 502 / 503 | `KYC_PROVIDER_ERROR` | Didit unavailable; offer a retry |
| 503 | `KYC_UNAVAILABLE` | Verification temporarily unavailable on our side. Show "try again later"; don't loop retries |

## 3. Launch the Didit SDK

**Web** — [`@didit-protocol/sdk-web`](https://docs.didit.me/integration/web-sdks/overview), using `verificationUrl`:

```ts
DiditSdk.shared.onComplete = () => pollStatus();
DiditSdk.shared.startVerification({ url: verificationUrl });
```

Fallbacks: redirect to `verificationUrl` (it returns to `<creator-portal>/kyc/complete`), or use an iframe with `allow="camera; microphone; fullscreen; autoplay; encrypted-media"`.

**React Native** — [`@didit-protocol/sdk-react-native`](https://docs.didit.me/integration/native-sdks/overview) (RN 0.76+, New Architecture; Expo needs a development build). Pass `sessionToken` to the SDK's start-verification call, then poll when it finishes. Handle the `buymeayard://kyc/complete` deep link as well, since it's the redirect fallback.

**Resuming:** calling `POST /session` again with the **same details** returns the unfinished session (`resumed: true`) and doesn't use up an attempt. Use this when a creator leaves mid-flow and comes back.

**Expiry:** an attempt that isn't finished 30 minutes after it was created is expired and the creator returns to their previous outcome (for example `NOT_SUBMITTED` or `REJECTED`), after which they can start again. It counts toward the daily limit (5 attempts per 24 hours).

## 4. After the SDK closes

**Don't trust the status reported by the SDK or the callback URL.** The backend is the source of truth. Poll `GET /api/v1/creators/me/kyc` every ~3 seconds for up to ~60 seconds, until `kycStatus` is no longer `PENDING`. If it's still pending after that, show "Verification in progress" and tell the creator we'll notify them. An in-app notification of type `KYC_UPDATE` arrives at `GET /api/v1/me/notifications` when the result lands.

## 5. Contributions are gated

Until a creator is verified (`creatorStatus: "ACTIVE"`), `POST /api/v1/supports` and `POST /api/v1/payments/initialize` return **403 `CREATOR_NOT_ACTIVE`**. On the public supporter page, check `status` on `GET /api/v1/creators/:slug`. If it isn't `ACTIVE`, show "Not accepting contributions yet" instead of the checkout. Payouts require both `kycStatus: "VERIFIED"` and `creatorStatus: "ACTIVE"`.

## 6. Admin portal

Requires the `ADMIN` or `SUPER_ADMIN` role.

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/admin/kyc?status=NEEDS_REVIEW&page=1&limit=20` | Review queue (oldest first, paginated `data.items` + `data.pagination`) |
| `GET /api/v1/admin/kyc/:id` | Details, including `claimedDetails`, `decisionSummary`, and the live Didit decision in `providerDecision` (shape below). Its image URLs expire quickly: display them, never store them. Each view is audit-logged |
| `POST /api/v1/admin/kyc/:id/approve` `{ note? }` | Approve an in-review case (or override a rejection) |
| `POST /api/v1/admin/kyc/:id/reject` `{ reason, note? }` | `reason` is shown to the creator; `note` is internal |
| `POST /api/v1/admin/kyc/creators/:creatorId/revoke` `{ reason, note? }` | Revoke a verified creator. It unpublishes them **and blocks re-verification** until unblocked |
| `POST /api/v1/admin/kyc/creators/:creatorId/unblock` `{ note? }` | Lift the block so the creator can verify again |

`providerDecision` is an allowlisted view (`KycAdminDecisionView`); any section can be `null`:

```json
{
  "status": "In Review",
  "idVerification": {
    "status": "Approved", "documentType": "Identity Card", "documentNumberLast4": "5678",
    "firstName": "Mariam", "lastName": "Omiteru", "dateOfBirth": "1995-10-12",
    "expirationDate": null, "issuingState": "NGA", "nationality": "NGA",
    "images": { "front": "https://…", "back": "https://…", "portrait": "https://…" }
  },
  "liveness": { "status": "Approved", "method": "PASSIVE", "score": 97.5, "referenceImage": "https://…" },
  "faceMatch": { "status": "In Review", "score": 62, "sourceImage": "https://…", "targetImage": "https://…" },
  "warnings": [{ "risk": "LOW_FACE_MATCH_SIMILARITY", "feature": "FACE_MATCH", "shortDescription": "…" }]
}
```

`decisionSummary.missingRequiredChecks` lists any check that held a Didit "Approved" back for review. A Didit "Approved" is only accepted automatically when ID verification, liveness and face match are each individually approved (`KYC_REQUIRED_CHECKS`). Otherwise the case lands in this queue instead of verifying the creator.

- `409 KYC_INVALID_TRANSITION` means the case changed in the meantime: refresh and try again.
- `409 KYC_BLOCKED` on approve means the creator is blocked: unblock them first.
- The creator objects in queue and detail responses include `kycBlockedAt` and `kycBlockedReason`.

## 7. Testing

Use the Didit **sandbox** application's keys in development. The Didit Console can send test webhooks (approved, declined, in review), so you can see each screen without doing a real ID capture.

**Sandbox only works with `NODE_ENV=development`.** When `NODE_ENV=production` (which includes our staging deployment), the backend deliberately ignores webhooks whose `environment` is `sandbox`. Use a live Didit application there, or expect results to arrive only through the status poll (§4).

Didit can only reach `/webhooks/didit` on a public URL. On a local machine, use a tunnel (`cloudflared tunnel --url http://localhost:3000` or `ngrok http 3000`), or leave `DIDIT_WEBHOOK_SECRET` empty and rely on `GET /creators/me/kyc` pulling the result once an attempt is more than 60 seconds old.

## 8. Troubleshooting: verification never completes

Check the creator's status with `GET /creators/me/kyc`, then match it to the cause:

| Symptom | Likely cause | What to check |
|---|---|---|
| Stays `PENDING` after capture | The webhook isn't arriving, or is being ignored | Didit Console → Webhooks → delivery log. A `401` means the wrong `DIDIT_WEBHOOK_SECRET`, or a clock more than 5 minutes off. A `404` means the URL has `/api/v1` in it; it must be `/webhooks/didit`. A `200` with `ignored: "sandbox_event"` means a sandbox application is talking to a `NODE_ENV=production` backend |
| Stays `PENDING`, webhook shows `200` but `ignored: "unknown_session"` | The Didit workflow ID doesn't match `DIDIT_WORKFLOW_ID`, or the session wasn't created by this backend | Compare the workflow in the Console with the env var |
| Goes to `NEEDS_REVIEW` even though Didit says "Approved" | A required check isn't individually approved (for example Face Match isn't in the workflow) | The admin detail view's `decisionSummary.missingRequiredChecks`. Fix the workflow in the Console or narrow `KYC_REQUIRED_CHECKS` |
| `REJECTED` right after capture | Didit declined it | `latestSubmission.rejectionReason` for the creator-safe reason, and the admin detail view's `providerDecision.warnings` for the raw risk codes |
| `POST /session` returns `503 KYC_UNAVAILABLE` | Didit says the account is out of credits (live applications only) | Look for `DIDIT OUT OF CREDITS` in the API logs and top up |
| `POST /session` returns `502/503 KYC_PROVIDER_ERROR` | Bad or missing `DIDIT_API_KEY` / `DIDIT_WORKFLOW_ID`, or Didit is unreachable | API logs: `Didit POST /v3/session/ returned <status>` |
| Returns to `NOT_SUBMITTED` | The attempt sat unfinished for 30 minutes and expired | Start a new session |

Every webhook the backend accepts is stored in `kyc_events` with a redacted payload, and every status change is in `audit_logs` (`KYC_SUBMISSION_STATUS_CHANGED`, with the `source`: `WEBHOOK`, `RECONCILE`, `ADMIN` or `SYSTEM`). A submission with a `RECONCILE` change but no webhook event means webhooks aren't getting through.
