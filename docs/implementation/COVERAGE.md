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
| chat | IMPLEMENTED | PHASE 11 — публичные/admin REST, WebSocket-гейтвей (каналы, мут/бан, pin), покрыто e2e; rate-limit/anti-spam — PHASE 26 |
| comments | IMPLEMENTED | PHASE 09 — CRUD + реакции + жалобы готовы; PHASE 16 — рассмотрение жалоб модератором (`/admin/comment-reports`) и hard-delete готовы, покрыты e2e |
| consent | MISSING | PHASE 25 |
| custom-positions | PARTIAL | PHASE 07 — CRUD + assign (1:1 на пользователя) готовы, покрыты e2e |
| decorations | PARTIAL | PHASE 08 — выбор из принадлежащих готов и покрыт e2e; выдача декораций (покупка/admin grant) — PHASE 17/20 |
| departments | PARTIAL | PHASE 07 — CRUD + assign/reorder готовы, покрыты e2e |
| direct-messages | IMPLEMENTED | PHASE 10 — личные/групповые беседы, WebSocket-гейтвей, покрыто e2e |
| emojis | MISSING | кастомные emoji не описаны требованиями этой фазы; свободные emoji-реакции уже работают в comments/activity/direct-messages (PHASE 09/10) |
| events | PARTIAL | PHASE 14 — публичный CRUD/attendance/видимость и admin CRUD+publish/cancel готовы, покрыты e2e; EVENT_REMINDER (cron) — PHASE 29 |
| export | MISSING | PHASE 20 |
| forms | PARTIAL | PHASE 15 — конструктор форм (33 типа полей), публичный CRUD/видимость/invite-only/черновики и admin CRUD+publish/close/duplicate+responses+stats+invites готовы, покрыты e2e; загрузка файлов для FILE_UPLOAD/IMAGE_GALLERY — PHASE 23 (RISKS.md R3); шаблоны форм (`FormTemplate`) и экспорт ответов — вне scope схемы БД этой фазы; referential-валидация PLAYER/SERVER/RANK/PRODUCT/ORDER/REPORT/PUNISHMENT/ACHIEVEMENT-селекторов — по мере соответствующих фаз (PHASE 16/17/18/19, ADR-0027) |
| friends | IMPLEMENTED | PHASE 09 — заявки/приём/отклонение/отмена/блокировка, все friendRequestPolicy, покрыты e2e |
| health | PARTIAL | PHASE 04 — `GET /health` (реальная проверка БД через Prisma); структурные логи/метрики — PHASE 28 |
| leaderboards | MISSING | PHASE 19 |
| minecraft | MISSING | PHASE 18 |
| moderation | IMPLEMENTED | PHASE 16 — quick moderation (mute/warn/kick/ban/hard-delete сообщения и комментария/удаление аккаунта), рассмотрение жалоб на комментарии/профили готовы, покрыты e2e; `users.change_role` заменён RBAC-эндпоинтами PHASE 06 (ADR-0029) |
| news | PARTIAL | PHASE 13 — публичный CRUD/лайки/комментарии/RSS и admin CRUD+модерация готовы, покрыты e2e; загрузка изображений — PHASE 23, автопубликация по расписанию — PHASE 29 |
| notifications | PARTIAL | PHASE 12 — REST/WS/email/push/discord-вебхуки и реальная межмодульная интеграция (friends/comments/activity/direct-messages/chat) готовы, покрыты e2e; периодический cron-дайджест — PHASE 29; push требует VAPID-ключей (RISKS.md R7) |
| positions | PARTIAL | PHASE 07 — CRUD + assign готовы, покрыты e2e; donor-тиры/staff-позиции — по мере необходимости |
| prisma | IMPLEMENTED | PHASE 04 — схема (108 моделей/53 enum) + миграция + PrismaModule |
| redis | PARTIAL | `RedisService` используется для brute-force (PHASE 05), RBAC permission-кеша (PHASE 06), chat presence (PHASE 11); централизованные cache keys/инвалидация — PHASE 24 |
| reports | PARTIAL | PHASE 16 — тикет-система обращений (создание/переписка/assign/status/verdict/заметки/lock/архив/report-ban), история наказаний (`UserPunishment`), donation-problem готовы, покрыты e2e; game-report/game-punishment (внешняя анти-чит интеграция), экспорт и upload вложений — вне scope (ADR-0033, RISKS.md R3) |
| roles (новый модуль, в старом проекте — `RoleGroup`, см. NOT_APPLICABLE) | PARTIAL | PHASE 06 — ядро RBAC и role-management API готовы и покрыты e2e; полный реестр 246 permission keys и staff-роли — по мере доменных фаз и PHASE 32 (ADR-0016) |
| statistics | MISSING | PHASE 19 |
| store | MISSING | PHASE 17 |
| streaming | PARTIAL | PHASE 14 — публичный список и admin CRUD готовы, покрыты e2e; реальный опрос Twitch/YouTube — PHASE 18/29 (RISKS.md R6) |
| system | MISSING | PHASE 25 |
| topics | PARTIAL | PHASE 14 — публичный CRUD/видимость и admin CRUD+reorder+pin готовы, покрыты e2e; вложения — PHASE 23 (CDN) |
| uploads (→ CDN) | MISSING | PHASE 23 |
| users | PARTIAL | PHASE 07 — admin список/поиск/пагинация + детальная карточка готовы; PHASE 16 — ban/kick/mute/warn/delete-account/жалобы на профиль готовы, покрыты e2e; badges/awards — PHASE 19 |
| voting | IMPLEMENTED | PHASE 14 — публичный обзор+webhook и admin CRUD+rotate-secret готовы, покрыты e2e |

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
