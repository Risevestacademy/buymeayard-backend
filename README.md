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
- **Node.js**: `>= 20.0.0`
- **pnpm**: `>= 11.0.0`
- **Docker & Docker Compose**: For local PostgreSQL and Redis

---

### Step-by-Step Setup

#### 1. Clone & Install Dependencies
```bash
# Clone the repository
git clone https://github.com/Risevestacademy/buymeayard-backend.git
cd buymeayard-backend

# Install dependencies across all monorepo workspaces
pnpm install

# Generate Prisma Client
pnpm --filter @buymeayard/api prisma:generate
```

#### 2. Configure Environment Variables
Copy [.env.example](file:///home/phantom/Documents/Github/buymeayard-backend/apps/api/.env.example) to `.env` in `apps/api/`:
```bash
cp apps/api/.env.example apps/api/.env
```
Ensure `BETTER_AUTH_SECRET` is set to a secure string (minimum 32 characters).

#### 3. Start Database & Redis (Docker)
Start the local PostgreSQL and Redis containers:
```bash
pnpm db:up
```

#### 4. Run Database Migrations
Apply the Prisma schema migrations to your local PostgreSQL instance:
```bash
pnpm db:migrate
```

#### 5. Seed the Database
Populate the database with the required default roles and the initial Super Admin account (`admin@buymeayard.com` / `AdminPassword123!`):
```bash
cd apps/api && pnpm prisma db seed
```
*(You can also run this command in your production environment's shell to seed your production database).*

#### 6. Start Backend API Server
Start the NestJS application with hot-reload:
```bash
pnpm dev
```
*(Or target the API package specifically: `pnpm --filter @buymeayard/api dev`)*

---

### Useful Development Commands

| Command | Description |
| :--- | :--- |
| `pnpm dev` | Start backend in development mode with hot-reload |
| `pnpm build` | Compile all monorepo packages and applications |
| `pnpm test` | Run automated unit test suite across workspaces |
| `pnpm lint` | Run ESLint with auto-fix across all packages |
| `pnpm db:up` | Boot local PostgreSQL & Redis containers in background |
| `pnpm db:down` | Stop local PostgreSQL & Redis containers |
| `pnpm db:logs` | View live streaming logs from database containers |
| `pnpm db:migrate` | Run Prisma migrations against the local database |
| `pnpm db:studio` | Launch visual Prisma Studio database GUI |

---

### Client Authentication Guide
The backend supports dual-mode authentication via Better Auth:

- **Web Applications (Browsers):**
  - Standard cookie authentication. On login/register, Better Auth sets secure HTTP-only session cookies (`better-auth.session_token`).
- **Mobile Applications (React Native / iOS / Android):**
  - Send the header `x-client-type: mobile` (or `x-platform: mobile`).
  - The API strips `Set-Cookie` headers and returns the session token directly in the JSON response:
    ```json
    {
      "token": "session-token-here",
      "user": { ... }
    }
    ```
  - For subsequent requests, authenticate using `Authorization: Bearer <token>`.

---

### Endpoints & Documentation
- **API Base:** [http://localhost:3000/api/v1](http://localhost:3000/api/v1)
- **Interactive Swagger Docs:** [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
- **Health Check:** [http://localhost:3000/health](http://localhost:3000/health)
- **Prisma Studio:** [http://localhost:5555](http://localhost:5555) (via `pnpm db:studio`)

---

## 10. CI/CD Pipeline

The project uses **GitHub Actions** for continuous integration. The workflow runs on every push or pull request to `main` and `dev`.

### Pipeline Steps

| Step | What it does |
| :--- | :--- |
| **Checkout** | Clones the repository |
| **Install pnpm** | Sets up pnpm v11 with dependency caching |
| **Setup Node.js** | Configures Node.js v20 |
| **Install dependencies** | Runs `pnpm install --frozen-lockfile` |
| **Generate Prisma client** | Generates the typed database client |
| **Lint** | Runs ESLint across all packages |
| **Test** | Runs the full Jest test suite |
| **Build** | Compiles all packages via Turborepo |

The CI environment spins up **PostgreSQL 16** and **Redis 7** as service containers, so integration tests can run against real backing services.

The workflow is defined in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

### Manual Deployment to Render

To deploy the API to Render without using a Blueprint (which requires a payment method):

1. Go to the [Render Dashboard](https://dashboard.render.com).
2. Click **New** → **Web Service**.
3. Connect this GitHub repository and configure:
   - **Branch**: `main`
   - **Runtime**: `Docker` (Auto-detected from `Dockerfile`)
   - **Instance Type**: `Free`
4. In the **Environment Variables** section, add the required variables:
   - `DATABASE_URL` (Use Neon or Supabase)
   - `REDIS_URL` (Use Upstash)
   - `NODE_ENV=production`
   - `PORT=3000`
   - Your secret keys (Paystack, Cloudinary, Better Auth)
5. Render will automatically build and deploy new commits pushed to the `main` branch.

---

## 11. Production Docker Build

The project includes a multi-stage `Dockerfile` optimized for production deployments.

### Build & Run

```bash
# Build the production image
docker build -t buymeayard-api .

# Run the container
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e REDIS_URL="redis://..." \
  -e BETTER_AUTH_SECRET="your-production-secret" \
  -e BETTER_AUTH_URL="https://api.yoursite.com" \
  -e PAYSTACK_SECRET_KEY="sk_live_..." \
  -e PAYSTACK_WEBHOOK_SECRET="..." \
  buymeayard-api
```

### Image Stages

| Stage | Base | Purpose |
| :--- | :--- | :--- |
| **pruner** | `node:22-alpine` | Uses `turbo prune` to extract only the `@buymeayard/api` package and its workspace dependencies |
| **installer** | `node:22-alpine` | Installs deps, generates Prisma client, builds the NestJS app |
| **runner** | `node:22-alpine` | Minimal runtime — copies only compiled output, `node_modules`, and Prisma schema. Uses `dumb-init` for proper PID 1 signal handling |

### Key Design Decisions
- **Turbo prune** reduces the Docker context to only the files needed for the API app, keeping the image small.
- **Dependency layer caching** — `package.json` files are copied and installed before source code, so rebuilds after code changes skip the slow `pnpm install` step.
- **dumb-init** ensures `SIGTERM` is forwarded correctly to the Node process for graceful shutdowns in Kubernetes, ECS, or any orchestrator.

---

## 12. Project Documentation

| Document | Location |
| :--- | :--- |
| **Database Schema** | [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) — Full ER diagram, table dictionaries, and financial invariants |
| **API Reference (Swagger)** | [http://localhost:3000/api/docs](http://localhost:3000/api/docs) — Interactive API documentation (run `pnpm dev` first) |
| **CI Pipeline** | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — Lint → Test → Build |
| **Production Dockerfile** | [`Dockerfile`](Dockerfile) — Multi-stage Docker build |

