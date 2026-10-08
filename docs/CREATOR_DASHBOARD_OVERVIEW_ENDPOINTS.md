# Buy Me a Yard — Creator Dashboard (Overview) Endpoint Specifications

> **Source Figma Designs:**
> - **Overview (Empty State):** [Figma Node 1041:2974](https://www.figma.com/design/UDusiQTYGhdYKJJqawxndz/Buy-me-a-Yard---Design--UI-?node-id=1041-2974&m=dev)
> - **Overview (Populated State):** [Figma Node 1041:2666](https://www.figma.com/design/UDusiQTYGhdYKJJqawxndz/Buy-me-a-Yard---Design--UI-?node-id=1041-2666&m=dev)
> - **PRD References:** § 3.1.4 (Creator Dashboard and Basic Analytics), § 3.1.5 (Contributions and Supporter Messages), § 3.1.6 (Payout Setup and Withdrawals).

---

## 1. Architectural Strategy

To deliver an ultra-fast, responsive dashboard for both **Next.js (Web)** and **React Native / Expo (Mobile)** without multiple network waterfalls, we adopt a **hybrid endpoint pattern**:

1. **Composite Overview Endpoint (`GET /api/v1/creators/me/overview`):**
   - Fetches the complete dashboard view in a **single round-trip** (Profile status, KPI summary metrics, balance breakdown, recent contributions, and default 30-day earnings chart).
2. **Targeted Sub-Endpoints:**
   - Dedicated endpoints for granular updates (e.g. when changing chart timeframes, polling live balance, or triggering withdrawals).

All currency calculations strictly conform to the **integer minor currency unit (Kobo)** standard defined in `docs/DATABASE_SCHEMA.md`.

---

## 2. Screen Component Breakdown & Data Mapping

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ TOP ROW: Creator Identity, Live Status Pill & Page Actions                              │
│ • Avatar: Fisayo Rotibi   • Name: Fisayo Rotibi   • Status: [Page is live]             │
│ • Actions: [View page] (/@fisayo)  •  [Share page] (Copy link / QR Code)               │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SUMMARY METRICS (3 Cards)                                                              │
│ 1. Contributions: 24 (or -- in empty state)                                            │
│ 2. Contribution amount (Before charges): ₦120,000 (Gross in Kobo)                       │
│ 3. Net earnings (After charges): ₦114,000 (Net Creator Revenue in Kobo)                │
├───────────────────────────────────────────────────┬────────────────────────────────────┤
│ RECENT CONTRIBUTIONS CARD (Left)                  │ YOUR BALANCE CARD (Right)          │
│ • Empty: Graphic + "Share your page to receive..."│ • Available balance: ₦72,000       │
│ • Active: List of 3-5 latest gifts:               │ ────────────────────────────────── │
│   - "Ada Okafor sent you Ankara" [Icon] ₦5,000   │ • Pending balance: ₦12,000         │
│     “Your illustrations always brighten my day...”│ • Withdrawn to date: ₦30,000       │
│     Today, 10:42 AM                               │ ────────────────────────────────── │
│   - "Anonymous sent you Lace"   [Icon] ₦10,000   │ Actions:                           │
│   - "Chidi Nwosu sent you Aso-oke" [Icon] ₦20,000│ • [Withdraw] (Primary CTA)         │
│                                                   │ • [View payouts] (Secondary link)  │
├───────────────────────────────────────────────────┴────────────────────────────────────┤
│ EARNINGS OVER TIME (Bar Chart)                                                         │
│ • Heading: "Earnings over time"                                                        │
│ • Time-series bars (Gross vs Net volume over days/weeks)                               │
│ • Earnings Breakdown Formula: Gross (₦120k) − Charges (₦6k) = Net (₦114k)              │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Endpoints Specification

### 3.1 Composite Overview (Single Request for Full Dashboard)

* **HTTP Method:** `GET`
* **Route:** `/api/v1/creators/me/overview`
* **Auth:** Bearer Token / Session Cookie (`CREATOR` role required)
* **Query Parameters:**
  - `period` *(optional, string)*: `'7d' | '30d' | '90d' | '12m'` (default: `'30d'`)
  - `recentLimit` *(optional, number)*: Number of recent contributions to return (default: `5`, max: `10`)

#### Response (200 OK — Populated State)
```json
{
  "success": true,
  "data": {
    "creator": {
      "id": "c1f7b8e2-45a1-4389-9831-299fbd0d5612",
      "creatorName": "Fisayo Rotibi",
      "slug": "fisayo",
      "avatarUrl": "https://storage.buymeayard.com/avatars/fisayo.png",
      "pageStatus": "LIVE",
      "statusLabel": "Page is live",
      "publicPageUrl": "https://buymeayard.com/fisayo"
    },
    "metrics": {
      "totalContributions": 24,
      "grossRevenueKobo": 12000000,
      "grossRevenueFormatted": "₦120,000",
      "totalChargesKobo": 600000,
      "totalChargesFormatted": "₦6,000",
      "netEarningsKobo": 11400000,
      "netEarningsFormatted": "₦114,000",
      "currency": "NGN"
    },
    "balance": {
      "availableBalanceKobo": 7200000,
      "availableBalanceFormatted": "₦72,000",
      "pendingBalanceKobo": 1200000,
      "pendingBalanceFormatted": "₦12,000",
      "withdrawnBalanceKobo": 3000000,
      "withdrawnBalanceFormatted": "₦30,000",
      "currency": "NGN",
      "canWithdraw": true,
      "withdrawalBlockReason": null,
      "hasPayoutMethod": true,
      "kycStatus": "VERIFIED"
    },
    "recentContributions": [
      {
        "id": "sup_9a8b7c6d",
        "supporterName": "Ada Okafor",
        "supporterInitials": "AO",
        "isAnonymous": false,
        "material": {
          "id": "mat_ankara_01",
          "name": "Ankara",
          "slug": "ankara",
          "colorHex": "#D46331",
          "yards": 1
        },
        "headline": "Ada Okafor sent you Ankara",
        "message": "Your illustrations always brighten my day. Keep creating!",
        "amountKobo": 500000,
        "amountFormatted": "₦5,000",
        "createdAt": "2026-09-29T10:42:00.000Z",
        "relativeTime": "Today, 10:42 AM"
      },
      {
        "id": "sup_8b7c6d5e",
        "supporterName": "Anonymous",
        "supporterInitials": "AA",
        "isAnonymous": true,
        "material": {
          "id": "mat_lace_02",
          "name": "Lace",
          "slug": "lace",
          "colorHex": "#8669A8",
          "yards": 2
        },
        "headline": "Anonymous sent you Lace",
        "message": "A little support for your next project.",
        "amountKobo": 1000000,
        "amountFormatted": "₦10,000",
        "createdAt": "2026-09-29T09:18:00.000Z",
        "relativeTime": "Today, 9:18 AM"
      },
      {
        "id": "sup_7c6d5e4f",
        "supporterName": "Chidi Nwosu",
        "supporterInitials": "CN",
        "isAnonymous": false,
        "material": {
          "id": "mat_aso_oke_03",
          "name": "Aso-oke",
          "slug": "aso-oke",
          "colorHex": "#386E72",
          "yards": 4
        },
        "headline": "Chidi Nwosu sent you Aso-oke",
        "message": "Loved your latest series. Looking forward to what’s next.",
        "amountKobo": 2000000,
        "amountFormatted": "₦20,000",
        "createdAt": "2026-09-28T18:35:00.000Z",
        "relativeTime": "Yesterday, 6:35 PM"
      }
    ],
    "earningsChart": {
      "period": "30d",
      "currency": "NGN",
      "summary": {
        "grossKobo": 12000000,
        "chargesKobo": 600000,
        "netKobo": 11400000
      },
      "dataPoints": [
        {
          "date": "2026-09-27",
          "label": "Sep 27",
          "grossAmountKobo": 0,
          "netAmountKobo": 0,
          "contributionsCount": 0
        },
        {
          "date": "2026-09-28",
          "label": "Sep 28",
          "grossAmountKobo": 2000000,
          "netAmountKobo": 1900000,
          "contributionsCount": 1
        },
        {
          "date": "2026-09-29",
          "label": "Sep 29",
          "grossAmountKobo": 1500000,
          "netAmountKobo": 1425000,
          "contributionsCount": 2
        }
      ]
    }
  }
}
```

#### Response (200 OK — Empty State)
When the creator has received 0 contributions (Figma Node 1041:2974):
```json
{
  "success": true,
  "data": {
    "creator": {
      "id": "c1f7b8e2-45a1-4389-9831-299fbd0d5612",
      "creatorName": "Fisayo Rotibi",
      "slug": "fisayo",
      "avatarUrl": "https://storage.buymeayard.com/avatars/fisayo.png",
      "pageStatus": "LIVE",
      "statusLabel": "Page is live",
      "publicPageUrl": "https://buymeayard.com/fisayo"
    },
    "metrics": {
      "totalContributions": 0,
      "grossRevenueKobo": 0,
      "grossRevenueFormatted": "--",
      "totalChargesKobo": 0,
      "totalChargesFormatted": "--",
      "netEarningsKobo": 0,
      "netEarningsFormatted": "--",
      "currency": "NGN"
    },
    "balance": {
      "availableBalanceKobo": 0,
      "availableBalanceFormatted": "--",
      "pendingBalanceKobo": 0,
      "pendingBalanceFormatted": "--",
      "withdrawnBalanceKobo": 0,
      "withdrawnBalanceFormatted": "--",
      "currency": "NGN",
      "canWithdraw": false,
      "withdrawalBlockReason": "INSUFFICIENT_FUNDS",
      "hasPayoutMethod": false,
      "kycStatus": "NOT_SUBMITTED"
    },
    "recentContributions": [],
    "earningsChart": {
      "period": "30d",
      "currency": "NGN",
      "summary": {
        "grossKobo": 0,
        "chargesKobo": 0,
        "netKobo": 0
      },
      "dataPoints": []
    }
  }
}
```

---

### 3.2 Granular Balance & Payout Status

* **HTTP Method:** `GET`
* **Route:** `/api/v1/creators/me/balance`
* **Description:** Real-time balance enquiry derived directly from the immutable double-entry ledger. Powers the "Your balance" card and pre-validates withdrawal capability.

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "availableBalanceKobo": 7200000,
    "availableBalanceFormatted": "₦72,000",
    "pendingBalanceKobo": 1200000,
    "pendingBalanceFormatted": "₦12,000",
    "withdrawnBalanceKobo": 3000000,
    "withdrawnBalanceFormatted": "₦30,000",
    "currency": "NGN",
    "canWithdraw": true,
    "withdrawalBlockReason": null,
    "minimumWithdrawalKobo": 100000,
    "payoutFeeKobo": 5000,
    "payoutMethod": {
      "id": "pm_bank_01",
      "bankName": "Guaranty Trust Bank",
      "accountNumberMasked": "******7890",
      "accountName": "FISAYO ROTIBI"
    }
  }
}
```

---

### 3.3 Recent Contributions Feed

* **HTTP Method:** `GET`
* **Route:** `/api/v1/creators/me/recent-contributions`
* **Query Parameters:**
  - `limit` *(optional, number, default: 5)*
  - `cursor` *(optional, string, for pagination if expanding to full view)*
* **Description:** Retrieves the latest gifts received by the creator with supporter names masked based on the supporter's privacy tier (`PUBLIC`, `CREATOR_ONLY`, `ANONYMOUS`).

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "sup_9a8b7c6d",
        "supporterName": "Ada Okafor",
        "supporterInitials": "AO",
        "isAnonymous": false,
        "material": {
          "name": "Ankara",
          "colorHex": "#D46331",
          "yards": 1
        },
        "headline": "Ada Okafor sent you Ankara",
        "message": "Your illustrations always brighten my day. Keep creating!",
        "amountKobo": 500000,
        "amountFormatted": "₦5,000",
        "createdAt": "2026-09-29T10:42:00.000Z",
        "relativeTime": "Today, 10:42 AM"
      }
    ],
    "hasMore": true,
    "nextCursor": "sup_8b7c6d5e"
  }
}
```

---

### 3.4 Earnings Over Time Analytics

* **HTTP Method:** `GET`
* **Route:** `/api/v1/creators/me/analytics/earnings`
* **Query Parameters:**
  - `period`: `'7d' | '30d' | '90d' | '12m'` (default: `'30d'`)
* **Description:** Time-series aggregation for the bar chart showing daily/weekly breakdown of Gross Volume, Platform/Payment Charges, and Net Creator Earnings.

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "period": "30d",
    "currency": "NGN",
    "summary": {
      "grossKobo": 12000000,
      "grossFormatted": "₦120,000",
      "chargesKobo": 600000,
      "chargesFormatted": "₦6,000",
      "netKobo": 11400000,
      "netFormatted": "₦114,000"
    },
    "points": [
      {
        "date": "2026-09-28",
        "label": "Sep 28",
        "grossKobo": 2000000,
        "netKobo": 1900000,
        "count": 1
      },
      {
        "date": "2026-09-29",
        "label": "Sep 29",
        "grossKobo": 1500000,
        "netKobo": 1425000,
        "count": 2
      }
    ]
  }
}
```

---

### 3.5 Share Page Metadata & QR Code

* **HTTP Method:** `GET`
* **Route:** `/api/v1/creators/me/share-link`
* **Description:** Powers the "Share page" button modal. Returns the short vanity URL, pre-generated QR code (SVG/Data URL), and pre-composed social sharing text.

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "publicUrl": "https://buymeayard.com/fisayo",
    "qrCodeUrl": "https://api.buymeayard.com/v1/creators/fisayo/qr-code",
    "shareText": "Support my creative work on Buy Me a Yard! Send me a yard of Ankara, Aso-oke, or Lace:",
    "socialLinks": {
      "twitter": "https://twitter.com/intent/tweet?text=Support+my+creative+work...",
      "whatsapp": "https://api.whatsapp.com/send?text=Support+my+creative+work...",
      "facebook": "https://www.facebook.com/sharer/sharer.php?u=..."
    }
  }
}
```

---

### 3.6 Withdraw Funds (Triggered from Balance Card CTA)

* **HTTP Method:** `POST`
* **Route:** `/api/v1/creators/me/payouts`
* **Description:** Initiates a withdrawal of available balance to the creator's verified Nigerian bank account.
* **Request Body:**
```json
{
  "amountKobo": 5000000,
  "payoutMethodId": "pm_bank_01"
}
```

#### Response (201 Created)
```json
{
  "success": true,
  "data": {
    "payoutId": "po_6e5d4c3b2a",
    "amountKobo": 5000000,
    "amountFormatted": "₦50,000",
    "feeKobo": 5000,
    "netPayoutKobo": 4995000,
    "netPayoutFormatted": "₦49,950",
    "status": "PROCESSING",
    "estimatedArrival": "Under 30 minutes",
    "destination": {
      "bankName": "Guaranty Trust Bank",
      "accountNumber": "******7890",
      "accountName": "FISAYO ROTIBI"
    },
    "createdAt": "2026-09-29T10:50:00.000Z"
  }
}
```

---

## 4. Prisma Query & Ledger Derivation Implementation Plan

### 4.1 Balance Calculation (Financial Invariant)
The balance fields on the overview card must **never** read from a mutable column. They must be derived strictly via `LedgerService`:
```typescript
// Available Balance = Settled Credits - (Payout Debits + Payout Reservations)
const availableBalanceKobo = await ledgerService.getAccountBalance(creatorAccountId);

// Pending Balance = Sum of Supports where payment status = 'PENDING' / 'PROCESSING'
const pendingBalance = await prisma.support.aggregate({
  where: { creatorId, payment: { status: 'PENDING' } },
  _sum: { creatorAmount: true }
});

// Withdrawn Balance = Sum of successful payouts
const withdrawnBalance = await prisma.payout.aggregate({
  where: { creatorId, status: 'SUCCESSFUL' },
  _sum: { amount: true }
});
```

### 4.2 Recent Contributions Privacy Handling
When fetching contributions for the dashboard:
- If `privacyLevel === 'PUBLIC'`: display `supporter.name`
- If `privacyLevel === 'CREATOR_ONLY'`: display `supporter.name` (creator can see it, public wall cannot)
- If `privacyLevel === 'ANONYMOUS'`: display `"Anonymous"`, initials `"AA"`

---

## 5. Summary Checklist of Endpoints to Implement

| Endpoint | Method | Purpose | Status in Codebase |
| :--- | :--- | :--- | :--- |
| `/api/v1/creators/me/overview` (alias `/dashboard`) | `GET` | **Single aggregated endpoint** for full dashboard render | ✅ Implemented |
| `/api/v1/creators/me/dashboard/metrics` (alias `/me/metrics`) | `GET` | Summary KPI metrics (contributions, gross, net, fees) | ✅ Implemented |
| `/api/v1/creators/me/dashboard/balance` (alias `/me/balance`) | `GET` | Real-time available, pending, withdrawn balances | ✅ Implemented |
| `/api/v1/creators/me/dashboard/recent-contributions` (alias `/me/recent-contributions`) | `GET` | Recent gifts list with supporter & fabric badges | ✅ Implemented |
| `/api/v1/creators/me/dashboard/earnings` (alias `/me/analytics/earnings`) | `GET` | Time-series bar chart data points | ✅ Implemented |
| `/api/v1/creators/me/dashboard/contributions` | `GET` | Paginated contributions table with search/filters | ✅ Implemented |
| `/api/v1/creators/me/share-link` | `GET` | QR Code and share modal data | ✅ Implemented |
| `/api/v1/creators/me/payouts` | `POST` | Execute withdrawal from balance card | ✅ Implemented |

