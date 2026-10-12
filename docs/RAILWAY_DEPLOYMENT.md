# Deploying to Railway (Staging)

This guide deploys the API from the **`dev`** branch to a Railway **staging** environment, with Railway Postgres and Redis. Every merge to `dev` redeploys automatically, after GitHub Actions CI passes.

Config lives in [`railway.toml`](../railway.toml): Dockerfile build, `prisma migrate deploy` before each deploy, `/health` health check, restart on failure.

> **Staging uses `NODE_ENV=production`.** The env schema only accepts `development | production | test`. Production mode enforces required secrets and a strong admin password, which is what we want on staging. Use **test/sandbox** keys for Paystack and Didit so no real money moves.

---

## Part 1: Prerequisites

- [ ] `railway.toml` is merged into `dev`.
- [ ] A Railway account connected to GitHub, with access to the `buymeayard-backend` repo.
- [ ] Accounts and keys: Paystack (test), Cloudinary, Brevo (or SMTP), Didit (sandbox workflow).
- [ ] Locally: `psql`/`pg_dump` (only if migrating existing data), and optionally the Railway CLI (`npm i -g @railway/cli`).

---

## Part 2: Create the Railway project

1. Go to https://railway.com/new and choose **Deploy from GitHub repo**.
2. Pick `buymeayard-backend`. Railway will start a first build. **Let it fail or cancel it.** There are no variables yet.
3. Open the project **Settings**. Rename the default environment from `production` to **`staging`** (Project → Environments).

## Part 3: Add the database and Redis

1. In the project canvas click **+ New** → **Database** → **Add PostgreSQL**.
2. Click **+ New** → **Database** → **Add Redis**.

You now have three boxes: your API service, `Postgres`, `Redis`.

## Part 4: Point the service at `dev`

Click your API service → **Settings**:

1. **Source → Branch connected to production** → set to **`dev`**.
2. **Source → Wait for CI** → turn **ON**. Railway then deploys only after GitHub Actions passes.
3. **Build** should show *Dockerfile* (picked up from `railway.toml`).
4. **Deploy → Pre-deploy command** and **Healthcheck Path** should show the values from `railway.toml`. (If they appear blank, set them by hand:
   `node apps/api/node_modules/prisma/build/index.js migrate deploy --schema apps/api/prisma/schema.prisma` and `/health`.)

## Part 5: Set environment variables

API service → **Variables** → **Raw Editor**, and paste the block below, filling in the values.

```env
NODE_ENV=production

# Reference variables: Railway fills these from the plugins
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

# Better Auth: `openssl rand -base64 48` for the secret
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=https://REPLACE-AFTER-STEP-6
API_URL=https://REPLACE-AFTER-STEP-6

# Frontend(s)
CREATOR_FRONTEND_URL=https://your-staging-creator-app.example.com

# Paystack (TEST keys)
PAYSTACK_SECRET_KEY=sk_test_xxx
PAYSTACK_PUBLIC_KEY=pk_test_xxx
PAYSTACK_WEBHOOK_SECRET=

# Email
BREVO_API_KEY=
EMAIL_FROM="BuyMeAYard <buymeayard@gmail.com>"

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Didit (sandbox), all three REQUIRED when NODE_ENV=production
DIDIT_API_KEY=
DIDIT_WORKFLOW_ID=
DIDIT_WEBHOOK_SECRET=
DIDIT_BASE_URL=https://verification.didit.me
KYC_MOBILE_CALLBACK_URL=buymeayard://kyc/complete
KYC_MAX_SESSIONS_PER_DAY=5
KYC_SESSION_TTL_MINUTES=30
KYC_REQUIRED_CHECKS=ID_VERIFICATION,LIVENESS,FACE_MATCH

# Platform
PLATFORM_FEE_PERCENTAGE=10
DEFAULT_CURRENCY=NGN

# Seed admin (used in Part 8). Strong password, 12+ chars
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=
```

Notes:
- **Do not set `PORT`.** Railway injects it and the app reads it.
- Optional: `POSTHOG_API_KEY`, `POSTHOG_HOST`.
- Click **Deploy** when prompted so the variables take effect.

## Part 6: Generate the public domain

1. API service → **Settings → Networking → Generate Domain**. You get something like `buymeayard-api-staging.up.railway.app`.
2. Go back to **Variables** and replace both `REPLACE-AFTER-STEP-6` values with `https://<that-domain>` (no trailing slash).
3. Save. Railway redeploys.

## Part 7: First deploy checklist

Watch **Deployments → latest → Deploy Logs**. You should see, in order:

1. Build finishes (Dockerfile stages: pruner → installer → runner).
2. **Pre-deploy**: Prisma applies every migration ("All migrations have been successfully applied").
3. App boots and the health check at `/health` passes → status **Active**.

Verify from your terminal:

```bash
curl https://<your-domain>/health
# Swagger docs:
open https://<your-domain>/api/docs
```

If the build/deploy fails, see **Troubleshooting** below.

## Part 8: Seed the admin user (once)

The runner image has no `ts-node`, so run the seed **from your machine** against the Railway database:

1. Postgres service → **Variables** → copy **`DATABASE_PUBLIC_URL`** (the public proxy URL, not the internal one).
2. Run:

```bash
cd apps/api
DATABASE_URL="<DATABASE_PUBLIC_URL>" \
NODE_ENV=production \
ADMIN_EMAIL="admin@yourdomain.com" \
ADMIN_PASSWORD="<strong-password-12+chars>" \
pnpm prisma db seed
```

This creates the default roles and the super admin. Never commit these values.

## Part 9: Wire up webhooks

Webhooks are mounted **without** the `/api/v1` prefix.

| Provider | URL | Secret |
| :--- | :--- | :--- |
| Paystack (Settings → API Keys & Webhooks) | `https://<domain>/webhooks/paystack` | verified with `PAYSTACK_SECRET_KEY` / `PAYSTACK_WEBHOOK_SECRET` |
| Didit (Console → API & Webhooks) | `https://<domain>/webhooks/didit` | `DIDIT_WEBHOOK_SECRET` = the destination's shared secret key |

## Part 10: CI/CD, how it works now

```
PR → dev  ──► GitHub Actions: lint → test → build → migrations → KYC e2e
merge to dev ──► Actions passes ──► Railway builds Dockerfile
                                  ──► pre-deploy: prisma migrate deploy
                                  ──► /health OK ──► traffic switches
```

- A failed migration or failed health check **keeps the previous deployment live**.
- To redeploy manually: Deployments → ⋮ → **Redeploy**.
- To roll back: Deployments → pick an older successful one → **Rollback**.

## Part 11: Migrating existing data (skip if staging starts empty)

```bash
# 1. Dump the old database (Neon/Supabase/etc.)
pg_dump -Fc --no-owner --no-acl "$OLD_DATABASE_URL" > dump.bin

# 2. Restore into Railway (use DATABASE_PUBLIC_URL)
pg_restore --no-owner --no-acl --clean --if-exists -d "$RAILWAY_PUBLIC_DATABASE_URL" dump.bin

# 3. Confirm migrations line up
cd apps/api && DATABASE_URL="$RAILWAY_PUBLIC_DATABASE_URL" pnpm prisma migrate status
```

If you restore data, skip Part 8 (the admin already exists).

---

## Troubleshooting

| Symptom | Cause / fix |
| :--- | :--- |
| `Config validation error: missing required production variables` | One of `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET`, `CREATOR_FRONTEND_URL` is unset. Set it in Variables. |
| Pre-deploy fails: `Can't reach database server` | `DATABASE_URL` isn't the reference `${{Postgres.DATABASE_URL}}`, or the Postgres service is still starting. Redeploy. |
| Pre-deploy fails: `prisma: not found` / module not found | Prisma CLI missing from the image. Check that `apps/api/node_modules/prisma` exists in the runner stage (Dockerfile). |
| Health check fails / "service unavailable" | App crashed on boot. Read the deploy logs; it's almost always a missing or invalid env var. |
| Seed refuses to run | Needs `NODE_ENV=production` plus a non-default `ADMIN_PASSWORD` of 12+ characters. |
| Login cookies not sticking from the frontend | Check `BETTER_AUTH_URL` matches the public domain, and that CORS and trusted origins allow the frontend origin. |
| Webhooks return 401/400 | Wrong secret, or the URL has `/api/v1` in it. Use `/webhooks/...`. |

## Notes

- The KYC expiry sweep (`KycExpiryService`, every 5 minutes) runs inside the API process. Keep **one replica** until it has a distributed lock.
- Railway bills by usage. Set a spending limit under Project → Usage.
- When ready for production: create a `production` environment from `main`, with live keys and its own Postgres and Redis.
