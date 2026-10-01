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

Use `prefill` for the legal name on Step 1. Use `contributionsEnabled` for the dashboard's "Contributions" card and `creatorStatus` for "Profile status" (`ACTIVE` = published).

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

- `dateOfBirth`: `YYYY-MM-DD`. The creator must be 18 or older. The Figma picker shows DD/MM/YYYY, so convert before sending.
- `country`: only `NGA` for now.
- `documentType`: `NATIONAL_ID` (NIN card or slip), `PASSPORT`, `DRIVERS_LICENCE` or `VOTERS_CARD`.

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

## 4. After the SDK closes

**Don't trust the status reported by the SDK or the callback URL.** The backend is the source of truth. Poll `GET /api/v1/creators/me/kyc` every ~3 seconds for up to ~60 seconds, until `kycStatus` is no longer `PENDING`. If it's still pending after that, show "Verification in progress" and tell the creator we'll notify them. An in-app notification of type `KYC_UPDATE` arrives at `GET /api/v1/me/notifications` when the result lands.

## 5. Contributions are gated

Until a creator is verified (`creatorStatus: "ACTIVE"`), `POST /api/v1/supports` and `POST /api/v1/payments/initialize` return **403 `CREATOR_NOT_ACTIVE`**. On the public supporter page, check `status` on `GET /api/v1/creators/:username`. If it isn't `ACTIVE`, show "Not accepting contributions yet" instead of the checkout. Payouts require both `kycStatus: "VERIFIED"` and `creatorStatus: "ACTIVE"`.

## 6. Admin portal

Requires the `ADMIN` or `SUPER_ADMIN` role.

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/admin/kyc?status=NEEDS_REVIEW&page=1&limit=20` | Review queue (oldest first, paginated `meta`) |
| `GET /api/v1/admin/kyc/:id` | Details, including `claimedDetails`, `decisionSummary`, and the live Didit decision in `providerDecision`. Its image URLs expire quickly: display them, never store them. Each view is audit-logged |
| `POST /api/v1/admin/kyc/:id/approve` `{ note? }` | Approve an in-review case (or override a rejection) |
| `POST /api/v1/admin/kyc/:id/reject` `{ reason, note? }` | `reason` is shown to the creator; `note` is internal |
| `POST /api/v1/admin/kyc/creators/:creatorId/revoke` `{ reason, note? }` | Revoke a verified creator. It unpublishes them **and blocks re-verification** until unblocked |
| `POST /api/v1/admin/kyc/creators/:creatorId/unblock` `{ note? }` | Lift the block so the creator can verify again |

- `409 KYC_INVALID_TRANSITION` means the case changed in the meantime: refresh and try again.
- `409 KYC_BLOCKED` on approve means the creator is blocked: unblock them first.
- The creator objects in queue and detail responses include `kycBlockedAt` and `kycBlockedReason`.

## 7. Testing

Use the Didit **sandbox** application's keys in development. The Didit Console can send test webhooks (approved, declined, in review), so you can see each screen without doing a real ID capture.
