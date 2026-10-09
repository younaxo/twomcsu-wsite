# syntax=docker/dockerfile:1.7
# Production-образ frontend (Next.js standalone). Собирается из корня монорепо:
#   docker build -f infrastructure/web.Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.twomc.su \
#     --build-arg NEXT_PUBLIC_CDN_BASE_URL=https://cdn-files.twomc.su -t twomc-web .
# NEXT_PUBLIC_* вшиваются на этапе сборки — это публичные значения, не секреты.

FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @twomc/web... --filter @twomc/shared...

FROM deps AS build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CDN_BASE_URL=https://cdn-files.twomc.su
ARG NEXT_PUBLIC_HCAPTCHA_SITE_KEY
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_CDN_BASE_URL=$NEXT_PUBLIC_CDN_BASE_URL \
    NEXT_PUBLIC_HCAPTCHA_SITE_KEY=$NEXT_PUBLIC_HCAPTCHA_SITE_KEY \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_TELEMETRY_DISABLED=1
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @twomc/shared run build && pnpm --filter @twomc/web run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S twomc && adduser -S twomc -G twomc
WORKDIR /app
COPY --from=build --chown=twomc:twomc /app/apps/web/.next/standalone ./
COPY --from=build --chown=twomc:twomc /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=twomc:twomc /app/apps/web/public ./apps/web/public
USER twomc
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
