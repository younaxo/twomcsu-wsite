# syntax=docker/dockerfile:1.7
# Production-образ API (NestJS). Собирается из корня монорепо:
#   docker build -f infrastructure/api.Dockerfile -t twomc-api .
# Миграции НЕ выполняются при старте контейнера — только явно:
#   docker compose -f infrastructure/docker-compose.prod.yml run --rm api pnpm --filter @twomc/api exec prisma migrate deploy

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
    pnpm install --frozen-lockfile --filter @twomc/api... --filter @twomc/shared...

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @twomc/shared run build && pnpm --filter @twomc/api run build

FROM base AS runtime
ENV NODE_ENV=production
RUN addgroup -S twomc && adduser -S twomc -G twomc
COPY --from=build --chown=twomc:twomc /app/node_modules ./node_modules
COPY --from=build --chown=twomc:twomc /app/package.json ./package.json
COPY --from=build --chown=twomc:twomc /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build --chown=twomc:twomc /app/packages/shared ./packages/shared
COPY --from=build --chown=twomc:twomc /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=twomc:twomc /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=twomc:twomc /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=twomc:twomc /app/apps/api/package.json ./apps/api/package.json
RUN mkdir -p /app/apps/api/uploads && chown twomc:twomc /app/apps/api/uploads
USER twomc
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${API_PORT:-4000}/health || exit 1
CMD ["node", "dist/main.js"]
