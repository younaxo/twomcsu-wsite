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
