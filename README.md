# Buy Me a Yard — Backend Technical Overview & Architecture

This document provides a comprehensive technical overview of the backend foundation, monorepo architecture, domain modules, financial principles, database schema, and development workflows for the **Buy Me a Yard** platform.

---

## 1. Product Context & Purpose

**Buy Me a Yard** is a creator-support platform designed primarily for African and Nigerian creators. Instead of sending a generic tip, supporters purchase culturally relevant "yards" of materials (such as *Ankara*, *Lace*, *Aso-oke*, and *Adire*) configured by creators.

The backend serves as the single source of truth consumed across all clients:
- **Web Applications:** Marketing, Creator App, Supporter App, Admin App (Next.js)
- **Mobile Application:** React Native mobile app

All clients consume the unified versioned REST API at `/api/v1`.

---

## 2. Monorepo Architecture

The repository is organized as a modular monolith using **pnpm workspaces** and **Turborepo**:

```
buymeayard-backend/
├── apps/
│   └── api/                  # Main NestJS 11 REST API
│       ├── prisma/           # PostgreSQL schema & migrations
│       └── src/
│           ├── common/       # Global filters, interceptors, guards, decorators, utils
│           ├── config/       # Strongly-typed environment configuration (Zod)
│           ├── infrastructure/ # Database, payment providers, storage, queues
│           └── modules/      # 16 encapsulated domain modules
├── packages/
│   ├── config/               # Shared TypeScript & ESLint configurations
│   └── types/                # Shared domain enums, interfaces, and API contracts
├── pnpm-workspace.yaml       # pnpm workspace definition
├── turbo.json                # Turborepo task pipeline
└── tsconfig.json             # Root TypeScript project references
```

---

## 3. Core Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Runtime & Language** | Node.js (v20+) / TypeScript 5.9 | Type-safe backend application |
| **Framework** | NestJS 11 | Modular monolith architecture |
| **API Style** | REST (`/api/v1`) | Shared API for web and mobile |
| **Database** | PostgreSQL | Primary relational data store |
| **ORM** | Prisma Client 6 | Type-safe database access & migrations |
| **Authentication** | Better Auth | Session & cookie-based authentication |
| **Payment Gateway** | Paystack | Card & local payment processing (abstracted) |
| **File Storage** | Cloudinary | Object storage for creator media |
| **Cache & Queues** | Redis + BullMQ | Background jobs & temporary state |
| **Documentation** | OpenAPI / Swagger | API documentation at `/api/docs` |
| **Testing & Quality** | Jest / ESLint / Prettier | Automated verification |

---

## 4. Foundational Financial Principles

The backend enforces strict financial invariants to ensure consistency and prevent fraud:

### A. Separation of Concerns
```
Support (Intent)  ──>  Payment (Gateway Attempt)  ──>  Ledger (Accounting Truth)  ──>  Payout (Disbursement)
```
- **Support:** Represents the supporter's transaction intent and material selection.
- **Payment:** Represents the payment processor's execution attempt.
- **Ledger:** The sole financial source of truth. Balance is never a mutable column on the creator profile; it is calculated from immutable ledger entries.
- **Payout:** Funds transfer reserved against available balance.

### B. Integer Minor Units (Kobo)
Money is **never** represented using floating-point numbers.
- For `NGN`: amounts are stored in minor units (1 NGN = 100 Kobo).
- Example: ₦10,000 is stored internally as `1000000`.

### C. Historical Price Snapshots
Historical transactions must never mutate when a creator updates yard prices. The `SupportItem` record captures:
- `materialNameSnapshot`: Material name at time of purchase.
- `unitPrice`: Snapshot price in minor units.
- `quantity`: Number of yards.
- `totalPrice`: Computed total (`unitPrice × quantity`).

### D. Server-Authoritative Calculations
The client is **never** trusted for financial calculations. The frontend submits IDs and quantities; the backend authoritatively computes:
- Unit price
- Subtotal
- Platform fee split
- Final payable amount

### E. Idempotency & Protection
- **Webhook Idempotency:** Recorded in `payment_events` with unique constraints on `(provider, provider_event_id)` to prevent double-crediting on webhook retries.
- **Self-Support Prevention:** Backend rejects transactions where `supporter.userId === creator.userId`.
- **Payout Fund Reservation:** Payout amount is debited from available balance immediately upon request to eliminate double-withdrawal race conditions.

---

## 5. Domain Modules Breakdown (`apps/api/src/modules`)

Each domain owns its controllers, services, and business rules:

1. **`auth`**: Better Auth session endpoint, session extraction, and cookie management.
2. **`users`**: Profile retrieval and status handling.
3. **`creators`**: Creator onboarding, categories, social links, and public profiles.
4. **`supporters`**: Supporter profiles, support history, and preferences.
5. **`materials`**: Platform catalogue (`/materials`, `/materials/:slug`) and creator-specific yard menus.
6. **`supports`**: Support creation, server-side pricing calculation, and price snapshots.
7. **`payments`**: Payment initialization and Paystack webhook processing with idempotency.
8. **`ledger`**: Double-entry ledger recording immutable `CREDIT` entries for Creator and Platform accounts.
9. **`payouts`**: Creator payout requests with immediate ledger balance reservation and eligibility checks.
10. **`content`**: Posts with server-side exclusive content entitlement checks (private media URLs are masked from unauthorized users).
11. **`follows`**: Supporter-creator follow relationships with unique constraints.
12. **`notifications`**: In-app notifications with mark-as-read endpoints.
13. **`kyc`**: KYC submissions and status tracking.
14. **`moderation`**: Content reporting and moderation review workflows.
15. **`admin`**: High-privilege dashboard metrics and audit logs guarded by `RolesGuard`.
16. **`analytics`**: Structured application event logging.

---

## 6. Infrastructure Layer (`apps/api/src/infrastructure`)

- **`database`**: `PrismaService` handling PostgreSQL connections and lifecycle hooks.
- **`payments`**: `PaymentProvider` interface and concrete `PaystackProvider` (HMAC-SHA512 webhook signature verification and checkout initialization).
- **`storage`**: `StorageProvider` abstraction for Cloudinary object storage.
- **`notifications`**: `NotificationProvider` abstraction for multi-channel messaging.
- **`queues`**: Module prepared for BullMQ background workers.

---

## 7. Common Framework Layer (`apps/api/src/common`)

- **Error Handling:** Global `HttpExceptionFilter` formatting errors into standard machine-readable responses:
  ```json
  {
    "error": {
      "code": "PAYMENT_ALREADY_PROCESSED",
      "message": "This payment has already been processed."
    }
  }
  ```
- **Response Envelope:** Global `TransformInterceptor` wrapping success responses:
  ```json
  {
    "data": {},
    "meta": {}
  }
  ```
- **Guards & Decorators:**
  - `@CurrentUser()`: Injects authenticated user from request.
  - `@Public()`: Bypasses authentication for discovery and webhook routes.
  - `@Roles(...)`: Restricts routes using `RolesGuard`.

---

## 8. Database Schema Overview (`apps/api/prisma/schema.prisma`)

The PostgreSQL schema implements 24 models covering all TRD requirements:

- **Identity & Better Auth:** `users`, `sessions`, `auth_accounts`, `verifications`, `roles`, `user_roles`.
- **Creator Profile & Menu:** `creator_profiles`, `creator_categories`, `creator_social_links`, `materials`, `creator_materials`.
- **Transactions & Money:** `supports`, `support_items`, `payments`, `payment_events`, `refunds`.
- **Ledger & Payouts:** `accounts`, `ledger_entries`, `payouts`, `payout_methods`.
- **Content & Media:** `posts`, `media`, `post_media`, `post_entitlements`.
- **Social & Governance:** `follows`, `notifications`, `kyc_submissions`, `content_reports`, `audit_logs`.

---

## 9. Local Development & Setup

### Prerequisites
- Node.js >= 20.0.0
- pnpm >= 11.0.0
- PostgreSQL & Redis (local or Docker)

### Installation
```bash
# Clone the repository
git clone https://github.com/Risevestacademy/buymeayard-backend.git
cd buymeayard-backend

# Install dependencies across monorepo
pnpm install

# Generate Prisma Client
pnpm --filter @buymeayard/api prisma:generate
```

### Environment Configuration
Copy [.env.example](file:///home/phantom/Documents/Github/buymeayard-backend/apps/api/.env.example) to `.env` in `apps/api/`:
```bash
cp apps/api/.env.example apps/api/.env
```

### Build, Test & Run
```bash
# Build all packages and applications
pnpm build

# Run unit tests
pnpm test

# Run linter
pnpm lint

# Start API in development mode (with hot-reload)
pnpm --filter @buymeayard/api dev
```

### API Endpoints & Documentation
- **API Base:** `http://localhost:3000/api/v1`
- **Swagger Documentation:** `http://localhost:3000/api/docs`
- **Health Check:** `http://localhost:3000/health`
