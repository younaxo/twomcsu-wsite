# COVERAGE — сверка с docs/technical (старый проект)

Статусы: `IMPLEMENTED` / `PARTIAL` / `NOT_APPLICABLE` / `MISSING`. Заполняется по
мере реализации фаз (`ROADMAP.md`); заполняется честно — `NOT_APPLICABLE` только
для функций, сознательно не переносимых в новый проект (например `mock-complete`,
см. ADR-0009), с указанием причины.

## Модули (36 в старом проекте, `docs/technical/00-README.md`)

| Модуль | Статус | Примечание |
|---|---|---|
| achievements | MISSING | PHASE 19 |
| activity | MISSING | PHASE 09 |
| admin | MISSING | PHASE 20/21 |
| auth | MISSING | PHASE 05 |
| awards | MISSING | PHASE 19 |
| cache | MISSING | PHASE 24 |
| chat | MISSING | PHASE 11 |
| comments | MISSING | PHASE 09 |
| consent | MISSING | PHASE 25 |
| custom-positions | MISSING | PHASE 07 |
| decorations | MISSING | PHASE 08 |
| departments | MISSING | PHASE 07 |
| direct-messages | MISSING | PHASE 10 |
| emojis | MISSING | PHASE 11 |
| events | MISSING | PHASE 14 |
| export | MISSING | PHASE 20 |
| forms | MISSING | PHASE 15 |
| friends | MISSING | PHASE 09 |
| health | MISSING | PHASE 28 |
| leaderboards | MISSING | PHASE 19 |
| minecraft | MISSING | PHASE 18 |
| moderation | MISSING | PHASE 16 |
| news | MISSING | PHASE 13 |
| notifications | MISSING | PHASE 12 |
| positions | MISSING | PHASE 07 |
| prisma | MISSING | PHASE 04 |
| redis | MISSING | PHASE 24 |
| reports | MISSING | PHASE 16 |
| statistics | MISSING | PHASE 19 |
| store | MISSING | PHASE 17 |
| streaming | MISSING | PHASE 14 |
| system | MISSING | PHASE 25 |
| topics | MISSING | PHASE 14 |
| uploads (→ CDN) | MISSING | PHASE 23 |
| users | MISSING | PHASE 07 |
| voting | MISSING | PHASE 14 |

## Сознательно не переносится (NOT_APPLICABLE)

| Что | Причина |
|---|---|
| `ChatMessageReaction` (unused table) | В старом проекте реакции убраны из продукта — новая схема не создаёт эту таблицу |
| `/store/mock-payment`, `mock-complete` | CRITICAL security issue старого проекта (S2); заменено ADR-0009 |
| `RoleGroup` enum, `Position`-как-permissions | Заменено RBAC (ADR-0004) |
| Хардкод OWNER-паролей в seed | CRITICAL (S1); заменено ADR-0006 |
| `GameReport`/`GamePunishment` (TigerReports/LiteBans STUB) | Внешняя интеграция не описана в задании — остаётся вне scope, пока не появится отдельное требование |

## API / Database / Pages — считается при завершении фаз

Числа старого проекта (ориентир масштаба, не цель): 497 HTTP endpoints, 105 Prisma
моделей / 51 enum, 143 страницы, 3 WS namespace / 19 client→server событий.
Итоговые числа нового проекта и сверка — в `FINAL-REPORT.md` (PHASE 37).
