# syntax=docker/dockerfile:1
# Build context: monorepo root
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# ---- install deps ----
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

# ---- runtime image ----
FROM base AS runner
ENV NODE_ENV=production

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

# Copy source
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Persist SQLite database via Docker volume mount at /app/apps/api/data
RUN mkdir -p /app/apps/api/data

EXPOSE 3001
CMD ["node", "--import", "tsx/esm", "apps/api/src/index.ts"]
