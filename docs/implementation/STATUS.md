# STATUS

Project: twomc.su
Repository: https://github.com/younaxo/twomcsu-wsite

Current phase: PHASE 09 — Social system
Current branch: feature/profiles

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
- PHASE 08 — Profiles (публичный профиль с фильтрацией приватности,
  редактирование профиля, социальные ссылки, выбор декораций — 5 e2e-тестов)

In progress:
- PHASE 09 — Social system

Blocked:
none (см. RISKS.md для внешних зависимостей, не блокирующих независимую работу;
R11 — найдены чужие старые Docker volumes, не удалены, требуется решение владельца)

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
| PHASE 08 — Profiles | `feature/profiles` | *(в работе)* | in progress |

`feature/project-bootstrap` сохранена как есть (указывает на `4bee251`, все
коммиты PHASE 00–07 до нормализации) — согласно прямому указанию не удалять
и не менять её при нормализации. PR #5 (PHASE 00-07) и PR #6 (эта
нормализация) смержены в `main` (коммиты `56cb288`, `fc2d892`). Начиная с
PHASE 08 каждая фаза ведётся в собственной ветке от актуального `main`, по
нормальному workflow (branch → commits → push → PR → CI → merge), без
накопления нескольких фаз в одной ветке.

Checks (из корня монорепо, локально):
lint: pass
format:check: pass
typecheck: pass
tests: pass (unit 1/1, e2e 6 suite / 27 тестов — auth + RBAC + users-domain +
profiles, против реального Postgres+Redis)
build: pass

Last updated: 2026-10-04
