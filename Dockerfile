# ─────────────────────────────────────────────
# Stage 1: Prune the monorepo for the API app
# ─────────────────────────────────────────────
FROM node:20-alpine AS pruner
RUN corepack enable && corepack prepare pnpm@11 --activate
RUN apk add --no-cache libc6-compat

WORKDIR /app
COPY . .
RUN npx -y turbo prune @buymeayard/api --docker

# ─────────────────────────────────────────────
# Stage 2: Install dependencies
# ─────────────────────────────────────────────
FROM node:20-alpine AS installer
RUN corepack enable && corepack prepare pnpm@11 --activate
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Install dependencies first (cache layer)
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY .npmrc ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @buymeayard/api prisma:generate
RUN pnpm run build --filter=@buymeayard/api

# ─────────────────────────────────────────────
# Stage 3: Production runner
# ─────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl dumb-init

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy only what's needed to run
COPY --from=installer /app/apps/api/dist ./apps/api/dist
COPY --from=installer /app/apps/api/package.json ./apps/api/package.json
COPY --from=installer /app/apps/api/prisma ./apps/api/prisma
COPY --from=installer /app/node_modules ./node_modules
COPY --from=installer /app/packages ./packages
COPY --from=installer /app/package.json ./package.json

EXPOSE 3000

# dumb-init properly handles PID 1 and signal forwarding
CMD ["dumb-init", "node", "apps/api/dist/main.js"]
