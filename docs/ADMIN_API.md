# Admin API

Everything an admin can see and do. Base URL `/api/v1`. Built for the admin dashboard (Overview, Creators, Contributions, Payouts, Settings, Audit log) plus the moderation, support and finance screens behind it.

## Contents

1. [Access and conventions](#access-and-conventions)
2. [Overview (summary)](#overview-summary)
3. [Users](#users)
4. [Creators](#creators)
5. [KYC](#kyc)
6. [Contributions and refunds](#contributions-and-refunds)
7. [Payouts](#payouts)
8. [Ledger](#ledger)
9. [Moderation (reports)](#moderation-reports)
10. [Support tickets](#support-tickets)
11. [Waitlist](#waitlist)
12. [Settings (fee and withdrawal rules)](#settings-fee-and-withdrawal-rules)
13. [Audit log](#audit-log)
14. [Error codes](#error-codes)
15. [Deploying this change](#deploying-this-change)
16. [Known limits](#known-limits)

---

## Access and conventions

- **Auth:** the normal session (cookie on web, Bearer token on mobile). Every `/admin/*` route needs the **`ADMIN`** role, otherwise `403 FORBIDDEN`. There is no super admin; the seeded admin has `ADMIN` (and an unused `SUPER_ADMIN`).
- **Envelope:** success is `{ "data": ..., "meta": {} }`, errors are `{ "error": { "code", "message" } }`.
- **Lists:** `data: { items, pagination: { page, limit, total, totalPages } }`. Every list takes `page` (default 1), `limit` (default 20, max 100) and `search`. Where it says *date range*, the list also takes `from` and `to` as `YYYY-MM-DD`, inclusive, in Lagos time.
- **Money:** integers in **kobo** (₦1 = 100). Format in the UI.
- **Reasons:** every action that changes someone's standing or moves money needs a `reason` (1 to 500 characters). It is stored in the audit log.
- **Audit:** every admin write is recorded with who, what, the previous state, the new state and the reason. See [Audit log](#audit-log).
- **Self-protection:** an admin cannot suspend or ban themselves or another admin.

| Area | Route prefix |
|---|---|
| Overview | `GET /admin/summary` |
| Users | `/admin/users` |
| Creators | `/admin/creators` |
| KYC | `/admin/kyc` |
| Contributions, refunds | `/admin/supports`, `/admin/refunds` |
| Payouts | `/admin/payouts` |
| Ledger | `/admin/ledger` |
| Reports | `/admin/reports` |
| Support tickets | `/admin/support-tickets` |
| Waitlist | `/admin/waitlist` |
| Settings | `/admin/settings` |
| Audit log | `/admin/audit-logs` |

---

## Overview (summary)

`GET /admin/summary?from=2026-10-01&to=2026-10-22&weeks=8`

One call for the whole Overview page. `from` and `to` default to the 1st of this month and today, and drive the KPI cards. Each card's change compares against the **previous period of the same length**. `weeks` (2 to 26, default 8) sets the chart length; the chart always ends this week (weeks start Monday). The range can span at most 366 days.

| Screen element | Field |
|---|---|
| "Good morning, Ada" and "34 new contributions since midnight" | `greeting.adminName`, `greeting.newContributionsToday` |
| Date picker "1–22 Oct 2026" | `range.from`, `range.to` |
| **Total creators** and "+38 this month" | `kpis.totalCreators.value`, `.newInRange` |
| **Contributions received** and "+12.4% vs last month" | `kpis.contributionsReceived.value`, `.changePercent`, `.count` |
| **Pending payouts** and "3 requests over 48h" | `kpis.pendingPayouts.count`, `.lateCount`, `.amount`, `.lateAfterHours` |
| **Paid out to date** and "98.6% paid on time" | `kpis.paidOutToDate.amount`, `.paidOnTimePercent` |
| Sparklines in each card | `kpis.*.series`: `[{ day, value }]`, one per day in the range, zero-filled |
| "Review 12 payouts" button | `payoutQueue.count` |
| Contribution volume bars (orange) and payouts (purple) | `contributionVolume.weekly[]`: `{ weekStart, contributions, payouts }` |
| "Volume this week" | `contributionVolume.thisWeek` |
| "Average contribution" | `contributionVolume.averageContribution` |
| "Unique supporters" | `contributionVolume.uniqueSupporters` |
| **Payout queue** card | `payoutQueue.items[]` (the 4 oldest), `.count`, `.totalAmount` |
| **Recent creators** table | `recentCreators.items[]` (5 newest), `.total` |

The "change" objects look like `{ value, previous, changePercent }`; `changePercent` is `null` when the previous value was 0.

```jsonc
{
  "data": {
    "greeting": { "adminName": "Ada", "date": "2026-10-22", "newContributionsToday": 34 },
    "range": { "from": "2026-10-01", "to": "2026-10-22" },
    "currency": "NGN",
    "kpis": {
      "totalCreators": { "value": 1284, "newInRange": 38, "series": [{ "day": "2026-10-01", "value": 2 }] },
      "contributionsReceived": { "value": 28492000, "previous": 25350000, "changePercent": 12.4, "count": 410, "series": [] },
      "pendingPayouts": { "count": 12, "amount": 41200000, "lateCount": 3, "lateAfterHours": 48, "series": [] },
      "paidOutToDate": { "amount": 194000000, "paidOnTimePercent": 98.6, "series": [] }
    },
    "contributionVolume": {
      "weekly": [{ "weekStart": "2026-09-28", "contributions": 11500000, "payouts": 16736000 }],
      "thisWeek": { "value": 7248000, "previous": 6446000, "changePercent": 12.4 },
      "averageContribution": { "value": 4210, "previous": 4080, "changePercent": 3.1 },
      "uniqueSupporters": { "value": 1712, "previous": 1576, "changePercent": 8.6 }
    },
    "payoutQueue": {
      "count": 12,
      "totalAmount": 1846000,
      "items": [{
        "id": "…", "reference": "PYT-20261022-0041", "status": "PENDING",
        "amount": 248000, "netAmount": 243000, "bankName": "GTBank", "accountNumberLast4": "4412",
        "requestedAt": "2026-10-19T08:00:00.000Z", "ageHours": 74, "isLate": true,
        "creator": { "id": "…", "slug": "mayabuilds", "creatorName": "Maya Okonkwo", "avatarUrl": null }
      }]
    },
    "recentCreators": {
      "total": 1284,
      "items": [{
        "id": "…", "slug": "mayabuilds", "name": "Maya Okonkwo", "avatarUrl": null,
        "status": "ACTIVE", "kycStatus": "VERIFIED", "joinedAt": "2026-01-14T09:00:00.000Z", "contributed": 7248000
      }]
    }
  },
  "meta": {}
}
```

Definitions:

- **Contributions** count `PAID` and `COMPLETED` supports by `totalAmount` (what the supporter paid). Refunded ones drop out.
- **Pending payouts** are payouts still in flight: `REQUESTED`, `PENDING`, `PROCESSING`. A payout is **late** after 48 hours.
- **Paid on time** is the share of `SUCCESS` payouts that reached the bank within 48 hours of the request.
- **Unique supporters** counts distinct supporters, using the guest email for guest checkouts.
- **Payouts** in the chart are `SUCCESS` payouts by the week they finished, using the net amount sent to the bank.

Not in the data: the design's **Category** column. Creators have no category field in the database, so the table cannot show one until it is added.

---

## Users

| Method and path | What it does |
|---|---|
| `GET /admin/users` | List. Filters: `status` (`ACTIVE`, `SUSPENDED`, `BANNED`, `DEACTIVATED`), `role`, `search` (email or name). |
| `GET /admin/users/:id` | Detail: roles, creator profile link, counts (contributions made, tickets, reports filed), up to 10 active sessions, last 20 admin actions on the user. |
| `PATCH /admin/users/:id/status` | Body `{ "status": "ACTIVE" \| "SUSPENDED" \| "BANNED", "reason": "…" }`. |

What a status change does:

- **Suspended or banned:** the user is signed out everywhere (sessions deleted) and cannot sign in again. If they are a creator, the creator status becomes `SUSPENDED` or `BANNED` and the page is **unpublished**.
- **Reactivated (`ACTIVE`):** sign-in works again. A creator with verified, unblocked KYC returns to `ACTIVE`; otherwise `PROFILE_CREATED`. The page is **not** re-published; the creator does that.
- Blocked with `CANNOT_MODIFY_ADMIN`: your own account, or any account with the `ADMIN` role.

Granting and removing roles is not an endpoint yet (there is no super admin). Add admins through the seed or the database.

---

## Creators

| Method and path | What it does |
|---|---|
| `GET /admin/creators` | List with `contributed` (lifetime gross) and `contributionCount`. Filters: `status`, `kycStatus`, `search` (name, slug, email), `sort=newest\|oldest`. |
| `GET /admin/creators/:id` | Profile, user, social links, active payout method (account number masked), latest KYC submission, `balance` (available and in flight), `contributions` (count, gross, net, platform fees), `payouts` grouped by status, last 20 admin actions. |
| `PATCH /admin/creators/:id/status` | Body `{ "status": "ACTIVE" \| "SUSPENDED" \| "BANNED", "reason" }`. Suspend and ban also unpublish the page. |
| `POST /admin/creators/:id/unpublish` | Body `{ "reason" }`. Takes the page offline without changing the status. |

`:id` is the creator **profile** id. Setting `ACTIVE` only works when KYC is `VERIFIED` and there is no KYC block, otherwise `400 INVALID_STATUS_CHANGE`.

---

## KYC

Unchanged, see [KYC_INTEGRATION.md](KYC_INTEGRATION.md): `GET /admin/kyc`, `GET /admin/kyc/:id`, `POST /admin/kyc/:id/approve`, `/reject`, `POST /admin/kyc/creators/:creatorId/revoke`, `/unblock`. The queue now returns `data.items` and `data.pagination`.

---

## Contributions and refunds

| Method and path | What it does |
|---|---|
| `GET /admin/supports` | List. Filters: `status`, `creatorId`, date range, `search` (guest name, guest email, message, Paystack reference, creator slug). |
| `GET /admin/supports/:id` | Detail: items, payment, refunds, tickets, and the ledger entries for the payment and any refund. |
| `POST /admin/supports/:id/refund` | Body `{ "reason", "allowNegativeBalance"?: boolean }`. Full refund through Paystack. |
| `GET /admin/refunds` | List. Filters: `status` (`PENDING`, `PROCESSING`, `PROCESSED`, `FAILED`), date range. |

### How a refund works

1. Allowed only for a `PAID` or `COMPLETED` contribution whose payment succeeded, with no earlier refund that is open or processed. Always the **full** amount.
2. The creator's share and the platform fee are **debited in the ledger first** (like a payout reservation), so the money cannot be withdrawn while the refund runs.
3. Paystack is asked to refund the original transaction (`POST /refund`).
   - `processed`: the payment and the contribution become `REFUNDED`.
   - `pending` or `processing`: the refund is `PROCESSING`. Paystack's **`refund.processed`** or **`refund.failed`** webhook finishes it.
   - Rejected by Paystack: the ledger debits are reversed and the call returns `400 REFUND_NOT_ALLOWED`.
   - Unknown outcome (network error): the refund stays `PENDING` and the response says so. The webhook settles it, and Paystack refuses a second refund of the same payment, so retrying is safe.
4. If Paystack later sends `refund.failed`, the debits are reversed.

If the creator has already withdrawn the money, the refund is refused with `REFUND_EXCEEDS_CREATOR_BALANCE`. Send `allowNegativeBalance: true` to refund anyway; the creator's balance then goes below zero and shows up in the ledger reconciliation.

The Paystack webhook endpoint is the existing `POST /webhooks/paystack`. Paystack sends refund events to the same URL as charge and transfer events, so no extra setup is needed.

---

## Payouts

| Method and path | What it does |
|---|---|
| `GET /admin/payouts` | List. Filters: `status` (any stored status), `creatorId`, date range, `search` (reference, account name, creator slug). |
| `GET /admin/payouts/:id` | Detail: creator, Paystack events, tickets, and the ledger entries. |
| `POST /admin/payouts/:id/reconcile` | Asks Paystack what happened to an in-flight payout and applies it (success, failed, reversed). |
| `POST /admin/payouts/:id/retry` | For a stuck `REQUESTED` or `PENDING` payout. If Paystack has no record it sends the transfer again with the same reference; if it has, it applies the state instead. Never sends twice. |
| `POST /admin/payouts/:id/cancel` | Body `{ "reason" }`. Only for `REQUESTED` payouts Paystack has no record of. Status becomes `CANCELLED` and the reserved amount returns to the creator. |

Statuses: `REQUESTED`, `PENDING`, `PROCESSING`, `SUCCESS`, `FAILED`, `CANCELLED`. Creators see them grouped as in progress, successful and failed. A failed or cancelled payout always credits the full amount back (`PAYOUT_REVERSED`) and notifies the creator.

The reconciler already runs every 10 minutes for payouts older than the delay window. These actions let an admin do it on demand.

---

## Ledger

| Method and path | What it does |
|---|---|
| `GET /admin/ledger` | Entries. Filters: `ownerType` (`CREATOR`, `PLATFORM`), `creatorId`, `entryType`, `direction`, `transactionId` (a payment, payout or refund id), date range. |
| `GET /admin/ledger/reconciliation` | Cross-checks the ledger. `healthy` is `true` when every check is empty. |

Reconciliation checks (lists are capped at 20 ids, counts are exact):

- creator accounts below zero (for example after a refund with `allowNegativeBalance`)
- paid contributions with no ledger entry
- failed or cancelled payouts without a reversal
- payouts without a reservation
- processing or processed refunds without a debit
- platform fee recorded in the ledger versus the fee on paid contributions

Also returns total balance and account count per owner type.

---

## Moderation (reports)

Reports are filed by users on posts (`POST /posts/:id/report`).

| Method and path | What it does |
|---|---|
| `GET /admin/reports` | List. Filter `status` (`PENDING`, `UNDER_REVIEW`, `RESOLVED`, `REJECTED`), `search`. |
| `GET /admin/reports/:id` | Report, reporter, the reported post (if it still exists), and how many other reports target it. |
| `PATCH /admin/reports/:id` | Body `{ "status": "UNDER_REVIEW" \| "RESOLVED" \| "REJECTED", "note"?, "removeContent"? }`. `removeContent` with `RESOLVED` archives the post. Records the reviewer and time. |

---

## Support tickets

Tickets are raised by creators about a payout or contribution (`POST /support-tickets`).

| Method and path | What it does |
|---|---|
| `GET /admin/support-tickets` | List. Filter `status` (`OPEN`, `RESOLVED`), `search` (message or email). |
| `GET /admin/support-tickets/:id` | Ticket, user, the payout or contribution it is about. |
| `PATCH /admin/support-tickets/:id` | Body `{ "status": "OPEN" \| "RESOLVED", "note"? }`. Resolving records who, when and the note; reopening clears them. |

---

## Waitlist

| Method and path | What it does |
|---|---|
| `GET /admin/waitlist` | Entries with `search` by email. |
| `GET /admin/waitlist/export` | The whole list as `waitlist.csv` (`email,joinedAt`). |

**Breaking:** the public `GET /waitlist` is removed because it exposed every email address. `POST /waitlist` (joining) is unchanged and public.

---

## Settings (fee and withdrawal rules)

| Method and path | What it does |
|---|---|
| `GET /admin/settings` | Current rules and the built-in defaults. |
| `PATCH /admin/settings` | Send only the fields to change. |

| Field | Meaning | Default |
|---|---|---|
| `platformFeePercent` | Share of each contribution the platform keeps, 0 to 50 (up to 2 decimals) | `PLATFORM_FEE_PERCENTAGE` env, else 10 |
| `minimumWithdrawal` | Smallest withdrawal, kobo | 100000 (₦1,000) |
| `payoutFeeTierLimit` | Withdrawals up to this amount pay the lower fee, kobo | 5000000 (₦50,000) |
| `payoutFeeUpToLimit` | Fee up to the tier limit, kobo | 5000 (₦50) |
| `payoutFeeAboveLimit` | Fee above the tier limit, kobo | 10000 (₦100) |

- The minimum withdrawal must be **higher than both payout fees**, otherwise `400 INVALID_SETTINGS`.
- A change applies to **new** contributions and withdrawals. Existing contributions keep the fee they were created with, and payouts keep their stored fee.
- The fee percentage can now be `0` (before, `0` silently became 10).
- The values are stored in the `platform_settings` table and cached for 30 seconds per server, so another server instance can take up to 30 seconds to pick up a change.
- The creator-facing screens read the same values: the withdrawal quote, the "minimum withdrawal" on the balance screen, and whether a creator can withdraw.
- Every change is audited with the old and new values.

---

## Audit log

| Method and path | What it does |
|---|---|
| `GET /admin/audit-logs` | Filters: `actorId`, `action`, `resourceType`, `resourceId`, date range, `search`. Each row includes the actor's name and email. |
| `GET /admin/audit-logs/:id` | One entry with `previousState`, `newState`, `metadata` (the reason) and `ipAddress`. |

Actions recorded:

| Action | Resource |
|---|---|
| `admin.user.status_changed` | `User` |
| `admin.creator.status_changed`, `admin.creator.unpublished` | `CreatorProfile` |
| `admin.support.refunded` | `Support` |
| `admin.payout.reconciled`, `.retried`, `.cancelled` | `Payout` |
| `admin.report.updated` | `ContentReport` |
| `admin.support_ticket.updated` | `SupportTicket` |
| `admin.settings.updated` | `PlatformSettings` |
| `admin.dashboard.view` | `AdminDashboard` |
| KYC actions | recorded in the KYC events, as before |

Audit writes never fail the request they belong to: if the write fails it is logged and the action still goes through.

---

## Error codes

| Code | When |
|---|---|
| `FORBIDDEN` | The signed-in user is not an admin |
| `CANNOT_MODIFY_ADMIN` | Suspending or banning yourself or another admin |
| `INVALID_STATUS_CHANGE` | Reactivating a creator who is not verified, or who is blocked |
| `REFUND_NOT_ALLOWED` | Not paid, already refunded, or Paystack rejected it |
| `REFUND_EXCEEDS_CREATOR_BALANCE` | The creator already withdrew the money |
| `PAYOUT_NOT_FOUND`, `PAYOUT_ALREADY_PROCESSED` | Missing payout, or the action does not fit its state |
| `PAYOUT_METHOD_REQUIRED` | Retry of a payout with no bank recipient |
| `INVALID_SETTINGS` | Minimum withdrawal not above the payout fee |
| `VALIDATION_ERROR` | Bad query or body (including a summary range that ends before it starts) |
| `NOT_FOUND`, `CREATOR_NOT_FOUND` | Unknown id |

---

## Deploying this change

1. **Migration:** `20261023100000_admin_refunds_settings_resolution_fields`. Adds the `platform_settings` table and columns on `refunds`, `support_tickets` and `content_reports`, plus indexes. Additive only. Run `prisma migrate deploy` with the release. If the code runs first, payments and payouts keep working on the built-in fee and withdrawal values (the settings read falls back and logs an error), but refunds, the settings endpoints and ticket and report resolution fail until the migration is applied.
2. **Paystack:** refunds use the live Paystack key. With the mock or `xxx` key, the provider answers `PROCESSED` without calling Paystack.
3. **Breaking for the frontend:**
   - public `GET /waitlist` is gone (use `GET /admin/waitlist`)
   - the earlier pagination change also applies to `GET /admin/kyc` and the waitlist list
4. **Existing data is untouched.** No backfill is needed; settings fall back to the old values until an admin changes them.

---

## Known limits

- **Full refunds only.** Partial refunds are not supported.
- **No role management.** With no super admin, granting the `ADMIN` role is done in the database or the seed.
- **No category** on creators, so the Overview table cannot show one.
- **Refund status** is settled by webhook. An unknown-outcome refund waits for the webhook; there is no polling of Paystack's refund status.
- **Cancel and retry** need a live Paystack key to check the transfer. With the mock key, the transfer check always says "pending" and both refuse.
- **Settings cache** is 30 seconds per server instance.
- The refund flow has been tested against mocks only. Run one real refund of a Paystack test payment before relying on it.
