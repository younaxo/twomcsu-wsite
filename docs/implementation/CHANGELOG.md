# CHANGELOG

Формат: по факту реализованных и смёрженных в `main` функций. Ничего
"запланированного" сюда не добавляется — см. `ROADMAP.md`.

## [Unreleased]

### Infrastructure
- Инициализирован pnpm monorepo: `apps/api` (NestJS 10), `apps/web` (Next.js 14 +
  Tailwind CSS), `packages/shared` (`@twomc/shared`).
- Единые команды из корня: `lint`, `format`, `format:check`, `typecheck`, `test`,
  `build`, `dev` — все проверки зелёные.
- CI (GitHub Actions): lint/format/typecheck/test/build, CodeQL, gitleaks,
  actionlint, dependabot.
- `infrastructure/docker-compose.yml`: Postgres 16 + Redis 7 с healthcheck —
  проверено реальным запуском (`pnpm db:up`), оба сервиса `healthy`.

### Database
- Prisma-схема (`apps/api/prisma/schema.prisma`): 108 моделей, 53 enum, первая
  миграция (`20261004115235_init`) применена к реальной БД (проверено: 109
  таблиц, включая `_prisma_migrations`).
- `PrismaModule`/`PrismaService`, `GET /health` (реальная проверка БД через
  Prisma), `ConfigModule` с валидацией env (`DATABASE_URL`, `API_PORT`,
  `NODE_ENV`).
