# COVERAGE — сверка с docs/technical (старый проект)

Статусы: `IMPLEMENTED` / `PARTIAL` / `NOT_APPLICABLE` / `MISSING`. Заполняется по
мере реализации фаз (`ROADMAP.md`); заполняется честно — `NOT_APPLICABLE` только
для функций, сознательно не переносимых в новый проект (например `mock-complete`,
см. ADR-0009), с указанием причины.

## Модули (36 в старом проекте, `docs/technical/00-README.md`)

| Модуль | Статус | Примечание |
|---|---|---|
| achievements | MISSING | PHASE 19 |
| activity | PARTIAL | PHASE 09 — лента (глобальная+персональная с учётом видимости), реакции, комментарии, настройки готовы и покрыты e2e; создание записей для событий других модулей (покупки, достижения и т.п.) — по мере появления этих модулей |
| admin | MISSING | PHASE 20/21 |
| auth | PARTIAL | PHASE 05 — register/login/refresh/sessions/change-reset-password готовы и покрыты e2e-тестами; email verification (`User.isVerified`) не реализована (как и в старом проекте — не было явного требования) |
| awards | MISSING | PHASE 19 |
| cache | MISSING | PHASE 24 |
| chat | MISSING | PHASE 11 |
| comments | PARTIAL | PHASE 09 — CRUD + реакции + жалобы готовы и покрыты e2e; рассмотрение жалоб модератором — PHASE 16 |
| consent | MISSING | PHASE 25 |
| custom-positions | PARTIAL | PHASE 07 — CRUD + assign (1:1 на пользователя) готовы, покрыты e2e |
| decorations | PARTIAL | PHASE 08 — выбор из принадлежащих готов и покрыт e2e; выдача декораций (покупка/admin grant) — PHASE 17/20 |
| departments | PARTIAL | PHASE 07 — CRUD + assign/reorder готовы, покрыты e2e |
| direct-messages | MISSING | PHASE 10 |
| emojis | MISSING | PHASE 11 |
| events | MISSING | PHASE 14 |
| export | MISSING | PHASE 20 |
| forms | MISSING | PHASE 15 |
| friends | IMPLEMENTED | PHASE 09 — заявки/приём/отклонение/отмена/блокировка, все friendRequestPolicy, покрыты e2e |
| health | PARTIAL | PHASE 04 — `GET /health` (реальная проверка БД через Prisma); структурные логи/метрики — PHASE 28 |
| leaderboards | MISSING | PHASE 19 |
| minecraft | MISSING | PHASE 18 |
| moderation | MISSING | PHASE 16 |
| news | MISSING | PHASE 13 |
| notifications | MISSING | PHASE 12 |
| positions | PARTIAL | PHASE 07 — CRUD + assign готовы, покрыты e2e; donor-тиры/staff-позиции — по мере необходимости |
| prisma | IMPLEMENTED | PHASE 04 — схема (108 моделей/53 enum) + миграция + PrismaModule |
| redis | PARTIAL | Базовый клиент (`RedisService`) подключён в PHASE 05 для brute-force; централизованные cache keys/инвалидация — PHASE 24 |
| reports | MISSING | PHASE 16 |
| roles (новый модуль, в старом проекте — `RoleGroup`, см. NOT_APPLICABLE) | PARTIAL | PHASE 06 — ядро RBAC и role-management API готовы и покрыты e2e; полный реестр 246 permission keys и staff-роли — по мере доменных фаз и PHASE 32 (ADR-0016) |
| statistics | MISSING | PHASE 19 |
| store | MISSING | PHASE 17 |
| streaming | MISSING | PHASE 14 |
| system | MISSING | PHASE 25 |
| topics | MISSING | PHASE 14 |
| uploads (→ CDN) | MISSING | PHASE 23 |
| users | PARTIAL | PHASE 07 — admin список/поиск/пагинация + детальная карточка готовы, покрыты e2e; ban/kick/mute/warn — PHASE 16, badges/awards — PHASE 19 |
| voting | MISSING | PHASE 14 |

## Сознательно не переносится (NOT_APPLICABLE)

| Что | Причина |
|---|---|
| `ChatMessageReaction` (unused table) | В старом проекте реакции убраны из продукта — новая схема не создаёт эту таблицу |
| `/store/mock-payment`, `mock-complete` | CRITICAL security issue старого проекта (S2); заменено ADR-0009 |
| `RoleGroup` enum, `Position`-как-permissions | Заменено RBAC (ADR-0004) |
| Хардкод OWNER-паролей в seed | CRITICAL (S1); заменено ADR-0006 |
| `GameReport`/`GamePunishment` (TigerReports/LiteBans STUB) | Внешняя интеграция не описана в задании — остаётся вне scope, пока не появится отдельное требование |

## Database (PHASE 04 — IMPLEMENTED: схема и миграции; сервисы — по доменным фазам)

| Показатель | Старый проект | Новый проект |
|---|---|---|
| Prisma models | 105 | 108 (102 перенесено + Role/Permission/RolePermission/UserRole/RoleAssignmentLog + File) |
| Prisma enums | 51 | 53 (50 перенесено − RoleGroup + PermissionEffect/AccountType/FileStatus) |
| Миграции | 41 | 1 (`20261004115235_init`) |

## API / Database / Pages — считается при завершении фаз

Числа старого проекта (ориентир масштаба, не цель): 497 HTTP endpoints, 105 Prisma
моделей / 51 enum, 143 страницы, 3 WS namespace / 19 client→server событий.
Итоговые числа нового проекта и сверка — в `FINAL-REPORT.md` (PHASE 37).
