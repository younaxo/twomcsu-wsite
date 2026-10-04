# STATUS

Project: twomc.su
Repository: https://github.com/younaxo/twomcsu-wsite

Current phase: PHASE 04 — Database foundation
Current branch: feature/project-bootstrap

Completed:
- PHASE 00 — Discovery (документация прочитана, roadmap/decisions/risks созданы)
- PHASE 01 — Project bootstrap (pnpm monorepo: apps/api, apps/web, packages/shared)
- PHASE 02 — CI (GitHub Actions: lint/typecheck/test/build, CodeQL, gitleaks, actionlint, dependabot)
- PHASE 03 — Local infrastructure (Docker Compose: Postgres+Redis, проверено живым запуском)

In progress:
- PHASE 04 — Database foundation (Prisma schema)

Blocked:
none (см. RISKS.md для внешних зависимостей, не блокирующих независимую работу;
R11 — найдены чужие старые Docker volumes, не удалены, требуется решение владельца)

Checks (из корня монорепо):
lint: pass
format:check: pass
typecheck: pass
tests: pass (1/1 — стандартный спек NestJS, реальные тесты появятся с первым модулем)
build: pass

Last updated: 2026-10-04
