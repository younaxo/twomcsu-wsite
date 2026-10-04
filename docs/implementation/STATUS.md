# STATUS

Project: twomc.su
Repository: https://github.com/younaxo/twomcsu-wsite

Current phase: PHASE 06 — RBAC / Permissions
Current branch: feature/project-bootstrap

Completed:
- PHASE 00 — Discovery (документация прочитана, roadmap/decisions/risks созданы)
- PHASE 01 — Project bootstrap (pnpm monorepo: apps/api, apps/web, packages/shared)
- PHASE 02 — CI (GitHub Actions: lint/typecheck/test/build, CodeQL, gitleaks, actionlint, dependabot)
- PHASE 03 — Local infrastructure (Docker Compose: Postgres+Redis, проверено живым запуском)
- PHASE 04 — Database foundation (Prisma schema: 108 моделей/53 enum, миграция
  применена к реальной БД, PrismaModule+HealthModule в NestJS, env-валидация)
- PHASE 05 — Authentication (register/login/refresh-rotation/sessions/change-
  password/forgot-reset-password, brute-force+captcha, бан блокирует сессию
  немедленно — 10 e2e-тестов против реального Postgres+Redis)

In progress:
- PHASE 06 — RBAC / Permissions

Blocked:
none (см. RISKS.md для внешних зависимостей, не блокирующих независимую работу;
R11 — найдены чужие старые Docker volumes, не удалены, требуется решение владельца)

Checks (из корня монорепо, локально):
lint: pass
format:check: pass
typecheck: pass
tests: pass (unit 1/1, e2e 10/10 — register/login/refresh-rotation/reuse-
detection/ban/brute-force/forgot-reset-password, против реального Postgres+Redis)
build: pass

CI (GitHub Actions, PR #5): первый прогон — gitleaks зафейлился на плейсхолдер-
токене в шаблонном README NestJS CLI (ложное срабатывание, не секрет проекта);
исправлено (.gitleaksignore + убран шаблонный README). CI дополнен сервисом
redis и JWT-секретами для PHASE 05. Статус прогона — отслеживается автоматически
(auto-fix monitor), не опрашивается вручную.

Last updated: 2026-10-04
