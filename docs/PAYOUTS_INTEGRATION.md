# Payouts Integration Guide (Web & React Native)

Creators withdraw their earnings to a Nigerian bank account through [Paystack Transfers](https://paystack.com/docs/transfers/). The backend checks the account with the bank, holds the amount in the ledger, sends the transfer, and settles it from Paystack's webhook.

```
Verify identity (KYC) → Add bank account → "Is this you?" → Save
  → Withdraw: Amount → Review → Confirm
  → In progress → Successful | Failed (balance restored)
```

All endpoints need the usual authenticated creator session (cookie on web, Bearer token on mobile). Responses use the standard envelope: `{ "data": ..., "meta": {} }` on success and `{ "error": { "code", "message" } }` on failure.

**All amounts are in naira**, in requests and responses. `45000` is ₦45,000.

Figma: *Hi-Fi Designs → Section 4* (web, frames `1486:*`) and *Mobile app* (frames `2672:*`).

Every response field is listed in [§10 Response reference](#10-response-reference). Swagger (`/api/docs`, tags **payouts** and **support-tickets**) has the same detail, with an example for every error code.

---

## 1. Setup status

The Payouts page's "A little setup. Then, you're ready." card, and any screen that needs to know where the creator is.

**Quick flags** (no extra call needed):

| Endpoint | Fields |
|---|---|
| `GET /users/me` | `isKycCompleted`, `isBankAccountConnected` |
| `GET /creators/me` | `isKycCompleted`, `isBankAccountConnected` |

**Full payouts overview**: `GET /creators/me/balance`

```json
{
  "availableBalance": 45000,
  "pendingBalance": 0,
  "withdrawnToDate": 29950,
  "currency": "NGN",
  "canWithdraw": true,
  "kycStatus": "VERIFIED",
  "hasPayoutMethod": true,
  "minimumWithdrawal": 1000,
  "setupStep": "READY",
  "payoutMethod": {
    "id": "7d9ffc2b-…",
    "bankName": "United Bank For Africa",
    "bankCode": "033",
    "accountName": "PRAISE OLUWASEUN ARIBISALA",
    "accountNumberLast4": "6765",
    "verified": true
  }
}
```

| Field | Meaning |
|---|---|
| `setupStep` | `VERIFY_IDENTITY` → show "Verify identity". `CONNECT_BANK` → show "Add bank account". `READY` → show the account card and **Withdraw** |
| `availableBalance` | Ready to withdraw |
| `pendingBalance` | Contributions still processing: checkouts opened in the **last hour** that Paystack hasn't confirmed. Abandoned checkouts are never marked failed, so older ones are not counted |
| `withdrawnToDate` | Total that reached the bank, **after fees** |
| `canWithdraw` | Verified, active, a verified account, and `availableBalance ≥ minimumWithdrawal`. When `false` because the balance is below the minimum, show the "You're below the minimum" modal |
| `payoutMethod` | The account card (`•••• 6765`, bank name), or `null` |

There is no flag for step 3 ("Receive contributions"). Use `availableBalance > 0 || withdrawnToDate > 0`.

---

## 2. Add or change the bank account

Same flow for **Add bank account** (1.2–1.5) and **Change payout account** (1.7). A creator has **one** payout account. Saving a new one replaces it, and the old one stays active until then. Withdrawals already submitted keep going to the account they were sent to.

Identity must be verified first (`400 KYC_REQUIRED` otherwise).

### 2.1 Bank list: `GET /payouts/banks`

```json
[{ "name": "United Bank For Africa", "code": "033", "slug": "united-bank-for-africa" }, …]
```

About 290 banks, sorted by name, cached on the server for 24 hours. Use `code` in the next calls.

### 2.2 Check the account: `POST /creators/me/payout-methods/resolve`

Show "Checking with your bank…" while this runs. **Nothing is saved.**

```json
// Request
{ "bankCode": "033", "accountNumber": "2226356765" }

// 200: show "Is this you?" with accountName
{
  "accountName": "PRAISE OLUWASEUN ARIBISALA",
  "accountNumber": "2226356765",
  "bankCode": "033",
  "bankName": "United Bank For Africa"
}
```

| Error | Screen |
|---|---|
| `400 BAD_REQUEST` "Enter a valid 10-digit account number" | 1.2c field error |
| `400 BANK_NOT_SUPPORTED` | Bank field error |
| `400 BANK_ACCOUNT_UNVERIFIED` | 1.5 "Bank verification unsuccessful" |
| `503 BANK_SERVICE_UNAVAILABLE` | "We couldn't reach the bank right now. Please try again." Paystack is down or rate-limited. **Not** the creator's fault, so don't show 1.5 |

### 2.3 Save: `POST /creators/me/payout-methods`

On "Yes, save this account". Same body as resolve. Returns the `payoutMethod` object from §1, then show "You're all set 🎉".

The server never trusts a name from the client. It reuses the lookup from §2.2 (kept for 15 minutes on the server) or looks the account up again, then creates a Paystack transfer recipient. Paystack checks the account again at that point.

---

## 3. Withdraw earnings

### 3.1 Amount and review: `GET /creators/me/payouts/quote?amount=45000`

Call it as the creator types (debounced), and on the Review screen.

```json
{
  "amount": 45000,
  "fee": 50,
  "netAmount": 44950,
  "minimumWithdrawal": 1000,
  "availableBalance": 45000,
  "isValid": true,
  "error": null
}
```

`error` is `BELOW_MINIMUM` ("Minimum withdrawal: ₦1,000") or `EXCEEDS_BALANCE` ("You can withdraw up to …"). Disable **Continue** when `isValid` is `false`.

### 3.2 Confirm: `POST /creators/me/payouts`

```http
POST /api/v1/creators/me/payouts
Idempotency-Key: 3f0c7b8e-…   ← new UUID per withdrawal attempt
{ "amount": 45000 }
```

**Always send `Idempotency-Key`.** If the request is retried (double tap, flaky network), the same key returns the same payout instead of withdrawing twice. Generate a new key when the creator starts a new withdrawal.

Returns the payout (see §4). Usually `status: "IN_PROGRESS"` → screen 2.5 "Withdrawal submitted". It can already be `FAILED` if Paystack rejected it outright → screen 2.7. The balance is restored either way.

| Error | Meaning |
|---|---|
| `400 BELOW_MINIMUM_WITHDRAWAL` | Under ₦1,000 |
| `400 INSUFFICIENT_FUNDS` | More than the available balance |
| `400 PAYOUT_METHOD_REQUIRED` | No verified account. Accounts saved before this release must be added again |
| `400 KYC_REQUIRED` / `403 CREATOR_NOT_ACTIVE` | Not allowed to withdraw |

### 3.3 Processing fee

The fee is **taken out of** the amount entered, not added on top. The balance goes down by exactly the amount entered, and the bank receives the amount minus the fee.

| Withdrawal | Fee |
|---|---|
| Up to ₦50,000 | ₦50 |
| Above ₦50,000 | ₦100 |

| Withdraw | Fee | Bank receives |
|---|---|---|
| ₦1,000 | ₦50 | ₦950 |
| ₦45,000 | ₦50 | ₦44,950 |
| ₦75,000 | ₦100 | ₦74,900 |
| ₦455,000 | ₦100 | ₦454,900 |

If a payout fails, **the full amount comes back, fee included**. Tiers live in `apps/api/src/modules/payouts/payout-fees.ts`. Always show the `fee` from the API; don't hard-code it in the apps. (The mobile design shows ₦500 for ₦455,000 and desktop shows ₦100. The API uses ₦100.)

Paystack charges its own transfer fee (₦10–₦50) to the platform's Paystack balance. The creator's fee covers it.

---

## 4. Payout history and details

### 4.1 History: `GET /creators/me/payouts`

| Query | Values |
|---|---|
| `status` | `all` (default), `successful`, `failed`, `in_progress` (the four tabs) |
| `sort` | `newest` (default), `oldest` |
| `page`, `limit` | Default `1`, `10`. Max `limit` is 50. Mobile infinite scroll: keep increasing `page` |

```json
{
  "items": [ /* payouts, see 4.2 without breakdown/failureReason */ ],
  "pagination": { "page": 1, "limit": 10, "total": 67, "totalPages": 7 }
}
```

`pagination.total` is the count next to "Payout history" for the selected tab.

### 4.2 Details: `GET /creators/me/payouts/:id`

The details drawer (web) / sheet (mobile), and the Submitted → Successful/Failed screens. Poll it on the Submitted screen if you want it to update live (every 5–10 s is enough).

```json
{
  "id": "fae82705-…",
  "reference": "PYT-20261017-0001",
  "status": "FAILED",
  "amount": 12500,
  "fee": 50,
  "netAmount": 12450,
  "currency": "NGN",
  "destination": {
    "bankName": "United Bank For Africa",
    "accountName": "PRAISE OLUWASEUN ARIBISALA",
    "accountNumberLast4": "6765"
  },
  "requestedAt": "2026-10-17T19:43:50.502Z",
  "processedAt": "2026-10-17T19:43:50.534Z",
  "breakdown": {
    "amountRequested": 12500,
    "transferred": 0,
    "feeCharged": 0,
    "returnedToBalance": 12500
  },
  "failureReason": "Your bank declined the transfer."
}
```

| `status` | Screen copy |
|---|---|
| `IN_PROGRESS` | "In Progress", Status row "Awaiting confirmation" |
| `SUCCESSFUL` | "Successful", "Net received". `processedAt` = Completed |
| `FAILED` | "Failed", "Transferred ₦0 / Fee charged ₦0 / Returned to balance" from `breakdown` |

---

## 5. Contact support: `POST /support-tickets`

From a failed payout ("Contact support"), from a contribution, or from *Account → Contact support*.

```json
{ "message": "My withdrawal failed but my details are correct.", "payoutId": "fae82705-…" }
```

- `payoutId` (optional): the payout's reference, amount, date and status are attached ("Included automatically with your message").
- `contributionId` (optional): the same for a contribution. The creator who received it or the supporter who sent it can attach it.
- `message`: 1–2000 characters.

Returns `{ "id", "status": "OPEN", "createdAt" }` → show "Message sent". The message is stored in `support_tickets` and emailed to `SUPPORT_EMAIL`. If the email fails, the ticket is still saved.

---

## 6. Notifications

Sent **once per confirmed status change**, in-app and by email (per the creator's payout notification preferences). There is no notification when a withdrawal is submitted. **No push notifications are sent from the backend.**

| Type | Title | When |
|---|---|---|
| `PAYOUT_COMPLETED` | Money landed | Paystack confirms the transfer |
| `PAYOUT_FAILED` | Withdrawal didn't go through | Transfer failed or was reversed. Balance restored |
| `PAYOUT_DELAYED` | Payout is taking longer than usual | Still unconfirmed 30 minutes after the request ("typically arrive within 30 minutes") |

- **Notifications screen:** `GET /me/notifications?category=PAYOUT`, plus `PATCH /me/notifications/:id/read`, `POST /me/notifications/read-all`, `DELETE /me/notifications/:id`.
- **Notification detail:** each notification opens its payout. Use `data.payoutId` with `GET /creators/me/payouts/:id` (§4.2). `actionUrl` is `/dashboard/payouts?payoutId=…`.

---

## 7. How it works on the server

1. **Request:** under a lock on the creator row, the balance is re-checked, the payout is created with a copy of the destination account, and a `PAYOUT_RESERVATION` debit holds the full amount.
2. **Transfer:** the net amount is sent to the saved Paystack recipient with the reference in lowercase (Paystack requires it).
   - Paystack rejects it → payout `FAILED`, balance restored.
   - Network error → stays `PENDING`. The reconciler finds out what happened.
3. **Webhook** (`POST /webhooks/paystack`, no `/api/v1`): `transfer.success` → `SUCCESS`. `transfer.failed` / `transfer.reversed` → `FAILED` plus a `PAYOUT_REVERSED` credit. A transfer that already succeeded can still be reversed. Events are stored in `payment_events`, so repeats are ignored, and money is only ever returned once.
4. **Reconciler** (every 10 minutes, `payouts.reconciler.ts`): for payouts in progress for over 30 minutes, it asks Paystack for the transfer status and settles them if the webhook was missed. If Paystack has never heard of the transfer, it fails the payout and restores the balance. If the transfer is still pending, it sends the delayed notification once. Safe to run on several instances.

Statuses in the database: `REQUESTED`, `PENDING`, `PROCESSING` (shown as In Progress), `SUCCESS`, `FAILED`.

---

## 8. Configuration

| Variable | Value |
|---|---|
| `PAYSTACK_SECRET_KEY` | `sk_test_…` / `sk_live_…`. A value containing `mock` or `xxx` switches Paystack calls to fake responses (local only) |
| `PAYSTACK_WEBHOOK_SECRET` | **The same value as `PAYSTACK_SECRET_KEY`.** Paystack has no separate webhook secret; it signs webhooks with the secret key. Leaving this unset or as a placeholder rejects every webhook |
| `SUPPORT_EMAIL` | Inbox for "Contact support" messages (default `buymeayard@gmail.com`) |

### Paystack dashboard

- **Webhook URL:** *Settings → API Keys & Webhooks*. Test and live each have their own field. Use `https://<api-domain>/webhooks/paystack`. Paystack can't reach `localhost`; use a tunnel (e.g. `ngrok`) to test locally.
- **Transfers:** in test mode they already work against the test balance. In live mode the business must be activated (compliance approved), and the Paystack balance must have money, because payouts are paid from it.
- **Transfer OTP must be off.** Nobody can enter an OTP for a transfer the API starts. If OTP is on, payouts fail (and the balance is restored) with `Transfer requires OTP approval` in the logs. Test mode doesn't ask for OTP. In live mode, look for a *Transfers* section under *Settings → Preferences*. It only appears once transfers are enabled for the business. If there's no toggle, use the API:

  ```sh
  curl -X POST https://api.paystack.co/transfer/disable_otp \
    -H "Authorization: Bearer $PAYSTACK_SECRET_KEY"
  # Paystack sends an OTP to the business owner, then:
  curl -X POST https://api.paystack.co/transfer/disable_otp_finalize \
    -H "Authorization: Bearer $PAYSTACK_SECRET_KEY" -H "Content-Type: application/json" \
    -d '{"otp":"123456"}'
  ```

### Database

Migration `20261017120000_payouts_flow`:
- Adds fee, net amount, reference and destination copy to `payouts`.
- Adds bank code and Paystack recipient to `payout_methods`.
- Lets `payment_events` store transfer events.
- Creates `support_tickets` and the `payout_reference_seq` sequence (references look like `PYT-20261017-0001`).

Bank accounts saved before this migration have no Paystack recipient. Those creators get `PAYOUT_METHOD_REQUIRED` and must add their account again.

---

## 9. Testing

### Paystack test-mode limits

- **Only 3 real bank-account lookups per day in test mode.** After that Paystack returns `429 "Test mode daily limit of 3 live bank resolves exceeded"`, and our API returns `503 BANK_SERVICE_UNAVAILABLE`. Each added account uses one lookup (resolve, then save reuses it). If the save lands on a different server instance, or more than 15 minutes after resolve, it uses a second one. Plan QA around this, or test in live mode.
- **Test bank `001`** resolves any account number without the limit (name `TEST ACCOUNT <number>`), **but Paystack won't create a transfer recipient for it**. So it can test the "Is this you?" step, not saving. That's why it isn't in our bank list.
- Real accounts **can** be saved as recipients in test mode (within the lookup limit). Test transfers move no real money.

### Mock mode (no Paystack at all)

Set `PAYSTACK_SECRET_KEY=sk_test_mock`:
- The bank list is 7 common banks.
- Any account resolves as `MOCK ACCOUNT HOLDER`; account number `0000000000` fails (screen 1.5).
- Transfers stay in progress until you post a webhook yourself.

### Simulating Paystack webhooks locally

Webhooks must be signed with HMAC-SHA512 of the raw body using `PAYSTACK_WEBHOOK_SECRET`. The `reference` is the payout reference in lowercase.

```sh
BODY='{"event":"transfer.success","data":{"id":777,"reference":"pyt-20261017-0001"}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha512 -hmac "$PAYSTACK_WEBHOOK_SECRET" | awk '{print $NF}')
curl -X POST http://localhost:8000/webhooks/paystack \
  -H "Content-Type: application/json" -H "x-paystack-signature: $SIG" -d "$BODY"
```

Use `transfer.failed` or `transfer.reversed` to test the failure path (balance restored, "Withdrawal didn't go through").

### Known limitations

- `pendingBalance` counts only checkouts from the last hour (see §1).
- Duplicate bank codes exist in Paystack's list for a handful of microfinance banks; the first match is used for the bank name.

---

## 10. Response reference

All success responses are wrapped: `{ "data": <below>, "meta": {} }`. Money is in **naira**. Dates are ISO 8601 strings in UTC. "nullable" means the field is always present but can be `null`.

### Errors

```json
{ "error": { "code": "INSUFFICIENT_FUNDS", "message": "Requested payout (…) exceeds available balance (…)" } }
```

| Field | Type | Description |
|---|---|---|
| `error.code` | string | Stable code. Branch on this, never on the message |
| `error.message` | string | Human-readable. Validation messages are written for the creator and can be shown under the field |

| Code | HTTP | Endpoints | Meaning |
|---|---|---|---|
| `BAD_REQUEST` | 400 | all | Body or query failed validation, e.g. "Enter a valid 10-digit account number" |
| `UNAUTHORIZED` | 401 | all | No or expired session |
| `CREATOR_NOT_FOUND` | 404 | creator endpoints | The user has no creator profile |
| `KYC_REQUIRED` | 400 | resolve, save, withdraw | Identity not verified |
| `BANK_NOT_SUPPORTED` | 400 | resolve, save | Bank code not in the bank list |
| `BANK_ACCOUNT_UNVERIFIED` | 400 | resolve, save | The bank couldn't confirm the account → screen 1.5 |
| `BANK_SERVICE_UNAVAILABLE` | 503 | banks, resolve, save | Paystack unreachable or rate-limited (test mode: 3 lookups/day). Ask to retry |
| `BELOW_MINIMUM_WITHDRAWAL` | 400 | withdraw | Under ₦1,000 |
| `INSUFFICIENT_FUNDS` | 400 | withdraw | More than the available balance |
| `PAYOUT_METHOD_REQUIRED` | 400 | withdraw | No verified bank account saved |
| `INVALID_AMOUNT` | 400 | withdraw | Amount ≤ 0 |
| `CREATOR_NOT_ACTIVE` | 403 | withdraw | Creator suspended, banned or deactivated |
| `PAYOUT_NOT_FOUND` | 404 | payout details, support | Not this creator's payout |
| `NOT_FOUND` | 404 | support | Contribution not received or sent by this user |

### `GET /users/me` (setup flags)

Only the fields added or relevant to payouts. The rest of the response is unchanged.

| Field | Type | Description |
|---|---|---|
| `isKycCompleted` | boolean | Identity verification approved. `false` for non-creators |
| `isBankAccountConnected` | boolean | A verified payout bank account is saved. `false` for non-creators |
| `isOnboardingCompleted` | boolean | Onboarding finished (existing) |
| `creatorProfile.kycStatus` | string | `NOT_SUBMITTED`, `PENDING`, `VERIFIED`, `REJECTED`, `NEEDS_REVIEW`, `EXPIRED` |

### `GET /creators/me`

| Field | Type | Description |
|---|---|---|
| `isKycCompleted` | boolean | Identity verification approved (existing) |
| `isBankAccountConnected` | boolean | A verified payout bank account is saved. **Only on this endpoint**, never on public profiles (`GET /creators/:slug`) |

### Balance: `GET /creators/me/balance`

Also returned as `balance` inside `GET /creators/me/overview` and `GET /creators/me/dashboard`, and on its own by `GET /creators/me/dashboard/balance`.

| Field | Type | Description |
|---|---|---|
| `availableBalance` | number | "Ready to withdraw". Withdrawals in progress are already taken out |
| `pendingBalance` | number | "Contributions still processing": checkouts opened in the last hour, not yet confirmed by Paystack |
| `withdrawnToDate` | number | "Total sent to your bank account": sum of `netAmount` of successful payouts (after fees) |
| `currency` | string | `NGN` |
| `canWithdraw` | boolean | Verified + active + verified bank account + `availableBalance ≥ minimumWithdrawal` |
| `kycStatus` | string | See `/users/me` |
| `hasPayoutMethod` | boolean | Same as `isBankAccountConnected` |
| `minimumWithdrawal` | number | `1000` (₦1,000) |
| `setupStep` | `VERIFY_IDENTITY` \| `CONNECT_BANK` \| `READY` | Which setup card to show |
| `payoutMethod` | [PayoutMethod](#payoutmethod) \| null | The account card. `null` until a bank account is saved |

### Bank: `GET /payouts/banks` (array)

| Field | Type | Description |
|---|---|---|
| `name` | string | Display name, e.g. "United Bank For Africa" |
| `code` | string | Paystack bank code, e.g. `033`. Send as `bankCode` |
| `slug` | string | e.g. `united-bank-for-africa`. Can key a bank logo; no logo URL is returned, so use a fallback icon |

### ResolvedAccount: `POST /creators/me/payout-methods/resolve`

| Field | Type | Description |
|---|---|---|
| `accountName` | string | Name the bank has on file. Show it on "Is this you?" |
| `accountNumber` | string | The 10-digit number that was checked |
| `bankCode` | string | Bank code that was checked |
| `bankName` | string | Bank display name |

### PayoutMethod

Returned by `POST /creators/me/payout-methods`, and as `payoutMethod` in the balance.

| Field | Type | Description |
|---|---|---|
| `id` | uuid | Payout account ID |
| `bankName` | string | e.g. "Guaranty Trust Bank" |
| `bankCode` | string \| null | Paystack bank code |
| `accountName` | string | Name confirmed by the bank |
| `accountNumberLast4` | string | Display as "•••• 4589". The full number is never returned |
| `verified` | boolean | `true`: the name was confirmed with the bank before saving |

### PayoutQuote: `GET /creators/me/payouts/quote`

| Field | Type | Description |
|---|---|---|
| `amount` | number | Amount entered. What leaves the balance |
| `fee` | number | Processing fee taken out of `amount` (₦50 up to ₦50,000, ₦100 above). `0` when amount is 0 |
| `netAmount` | number | "You'll receive" = `amount − fee` |
| `minimumWithdrawal` | number | `1000` |
| `availableBalance` | number | Current available balance ("Available to withdraw") |
| `isValid` | boolean | Enable **Continue** only when `true` |
| `error` | `BELOW_MINIMUM` \| `EXCEEDS_BALANCE` \| null | Why it's invalid; `null` when valid |

### Payout

History items in `GET /creators/me/payouts` use this shape.

| Field | Type | Description |
|---|---|---|
| `id` | uuid | Payout ID. Use it for details and support |
| `reference` | string \| null | "PYT-20250925-0041", shown as Reference / Transaction ref. `null` only for payouts made before references existed |
| `status` | `IN_PROGRESS` \| `SUCCESSFUL` \| `FAILED` | In progress = waiting for the bank ("Awaiting confirmation"); Failed = full amount returned to balance |
| `amount` | number | Amount requested ("Withdrawal amount" / "Amount requested") |
| `fee` | number | Processing fee |
| `netAmount` | number | "You'll receive" / "Net received" |
| `currency` | string | `NGN` |
| `destination.bankName` | string \| null | Bank it was sent to. A copy taken at request time, so it stays correct after an account change |
| `destination.accountName` | string \| null | Account name |
| `destination.accountNumberLast4` | string \| null | "•••• 4589" |
| `requestedAt` | date | "Requested" and the history Date column |
| `processedAt` | date \| null | When it became Successful ("Completed") or Failed. `null` while in progress |

### PayoutDetail

Returned by `GET /creators/me/payouts/:id` and `POST /creators/me/payouts`: [Payout](#payout) plus:

| Field | Type | Description |
|---|---|---|
| `breakdown.amountRequested` | number | Same as `amount` |
| `breakdown.transferred` | number | `netAmount`, or `0` if failed |
| `breakdown.feeCharged` | number | `fee`, or `0` if failed |
| `breakdown.returnedToBalance` | number | `amount` if failed, otherwise `0` |
| `failureReason` | string \| null | Safe to show, e.g. "Your bank declined the transfer." `null` unless failed |

### Payout list: `GET /creators/me/payouts`

| Field | Type | Description |
|---|---|---|
| `items` | [Payout](#payout)[] | The page of payouts |
| `pagination.page` | integer | Current page |
| `pagination.limit` | integer | Page size |
| `pagination.total` | integer | Payouts in the selected tab. The count badge next to "Payout history" |
| `pagination.totalPages` | integer | Last page (minimum 1) |

### SupportTicket: `POST /support-tickets`

| Field | Type | Description |
|---|---|---|
| `id` | uuid | Ticket ID |
| `status` | `OPEN` \| `RESOLVED` | `OPEN` until support resolves it |
| `createdAt` | date | When it was sent |

### Payout notification: item in `GET /me/notifications?category=PAYOUT`

| Field | Type | Description |
|---|---|---|
| `category` | string | `PAYOUT` |
| `type` | string | `PAYOUT_COMPLETED`, `PAYOUT_FAILED` or `PAYOUT_DELAYED` |
| `title` | string | "Money landed" / "Withdrawal didn't go through" / "Payout is taking longer than usual" |
| `body` | string | Ready-to-show text, e.g. "₦44,950 has been sent to your GTBank account (••••4589)." |
| `data.payoutId` | uuid | Open `GET /creators/me/payouts/:id` |
| `data.reference` | string | Payout reference |
| `data.amount` | number | Amount requested |
| `data.netAmount` | number | Amount sent to the bank |
| `data.bankName` | string | Bank name |
| `data.accountNumberMasked` | string | e.g. `••••4589` |
| `actionUrl` | string | `/dashboard/payouts?payoutId=<id>` |
| `isRead` / `readAt` | boolean / date \| null | Read state |
| `createdAt` | date | "Just now" etc. |

