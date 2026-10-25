# syntax=docker/dockerfile:1
# Production image for the Next.js frontend (standalone output, ~150 MB).

ARG NODE_VERSION=22-alpine

# ---- Dependencies ----
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- Build ----
FROM node:${NODE_VERSION} AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The API proxy target is baked into the routes manifest at build time.
# In docker compose this is the internal service URL (http://backend:8080).
ARG BACKEND_API_URL=http://backend:8080
ENV BACKEND_API_URL=${BACKEND_API_URL} \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
RUN pnpm build

# ---- Runtime ----
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S nextjs && adduser -S -G nextjs nextjs

COPY --from=build --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nextjs /app/public ./public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/login" || exit 1

CMD ["node", "server.js"]
