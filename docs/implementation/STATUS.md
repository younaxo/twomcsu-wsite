# STATUS

Project: twomc.su
Repository: https://github.com/younaxo/twomcsu-wsite

Current phase: PHASE 08 — Profiles
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
- PHASE 06 — RBAC / Permissions (PermissionService, PermissionsGuard, Role/
  Permission CRUD API, priority-иерархия, Redis-кеш effective permissions с
  немедленной инвалидацией, seed 3 superuser-ролей — 7 e2e-тестов)
- PHASE 07 — Users (positions/departments/custom-positions CRUD+assign,
  admin users list+full detail, seed default-позиции — без неё регистрация
  не работала на чистой БД — 5 e2e-тестов)

In progress:
- PHASE 08 — Profiles

## История веток (normalized, см. RISKS.md R12)

PHASE 00–07 изначально велись в одной ветке (`feature/project-bootstrap`).
Ниже — historical branches, задним числом указывающие на commit завершения
каждого этапа (созданы как обычные branch pointers, без переписывания
истории — см. RISKS.md R12 про единственную неоднозначную границу
PHASE 04/05).

| PHASE | Branch | Last commit | Status |
|---|---|---|---|
| PHASE 00–01 — Discovery, Project bootstrap | `feature/project-bootstrap` | `7a6779e` | completed |
| PHASE 02–03 — CI, Local infrastructure | `feature/infrastructure` | `331ff09` | completed |
| PHASE 04 — Database foundation | `feature/database-foundation` | `2346864` | completed |
| PHASE 05 — Authentication | `feature/authentication` | `d5e05b8` | completed |
| PHASE 06 — RBAC / Permissions | `feature/rbac-permissions` | `81699a7` | completed |
| PHASE 07 — Users | `feature/users` | `4bee251` | completed |

`feature/project-bootstrap` — действующая ветка открытого PR #5, по факту
указывает на HEAD (все коммиты PHASE 00–07 до нормализации). Historical
branches выше созданы дополнительно, как точки навигации по истории; ветку
PR не меняли и не удаляли. Новые этапы (начиная с PHASE 08) идут через
отдельные feature-ветки по стандартному workflow.

Blocked:
none (см. RISKS.md для внешних зависимостей, не блокирующих независимую работу;
R11 — найдены чужие старые Docker volumes, не удалены, требуется решение владельца)

Checks (из корня монорепо, локально):
lint: pass
format:check: pass
typecheck: pass
tests: pass (unit 1/1, e2e 5 suite / 22 теста — auth + RBAC + users-domain,
против реального Postgres+Redis)
build: pass

CI (GitHub Actions, PR #5): гонка ложных срабатываний gitleaks (шаблонный
README, тестовый пароль) исправлена через .gitleaksignore + .gitleaks.toml
allowlist. CI дополнен сервисами postgres/redis, JWT-секретами и шагами
migrate deploy + db seed. Статус прогона — отслеживается автоматически
(auto-fix monitor), не опрашивается вручную.

Last updated: 2026-10-04
