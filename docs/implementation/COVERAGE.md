# COVERAGE — сверка с docs/technical (старый проект)

Статусы: `IMPLEMENTED` / `PARTIAL` / `NOT_APPLICABLE` / `MISSING`. Заполняется по
мере реализации фаз (`ROADMAP.md`); заполняется честно — `NOT_APPLICABLE` только
для функций, сознательно не переносимых в новый проект (например `mock-complete`,
см. ADR-0009), с указанием причины.

## Модули (36 в старом проекте, `docs/technical/00-README.md`)

| Модуль | Статус | Примечание |
|---|---|---|
| achievements | PARTIAL | PHASE 19 — CRUD, публичный список с прогрессом/секретностью, пакетный пересчёт (check-all-users) по 17/19 ConditionType из реальных данных, ручная выдача/отзыв, витрина готовы, покрыты e2e; DAYS_STREAK/PROFILE_VIEWS — нет персистентного счётчика (ADR-0044); rewardRubies не зачисляется — нет кошелька (ADR-0045); upload-icon — PHASE 23 |
| activity | PARTIAL | PHASE 09 — лента (глобальная+персональная с учётом видимости), реакции, комментарии, настройки готовы и покрыты e2e; создание записей для событий других модулей (покупки, достижения и т.п.) — по мере появления этих модулей |
| admin | PARTIAL | PHASE 20 — dashboard, audit log (read/stats), broadcast, KV- и структурированные настройки сайта, saved-filters/bookmarks/scheduled-exports (персональные), security (sessions/suspicious/logins/ip-whitelist), content/finance-дашборды, users/bulk (ban/unban с priority-проверкой), CSV-экспорт (users/orders/reports/news/audit-log) готовы, покрыты e2e; ретроактивное audit-логирование всех остальных доменов — PHASE 22; фактическое выполнение scheduled-exports по расписанию — PHASE 29; frontend-панель — PHASE 21 |
| auth | PARTIAL | PHASE 05 — register/login/refresh/sessions/change-reset-password готовы и покрыты e2e-тестами; email verification (`User.isVerified`) не реализована (как и в старом проекте — не было явного требования) |
| awards | IMPLEMENTED | PHASE 19 — публичный список, admin CRUD, выдача/отзыв пользователю, покрыто e2e |
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
| export | IMPLEMENTED | PHASE 20 — CSV-экспорт users/orders/reports/news/audit-log (+ finance/export — тот же `exportService.exportOrders`), покрыто e2e |
| forms | PARTIAL | PHASE 15 — конструктор форм (33 типа полей), публичный CRUD/видимость/invite-only/черновики и admin CRUD+publish/close/duplicate+responses+stats+invites готовы, покрыты e2e; загрузка файлов для FILE_UPLOAD/IMAGE_GALLERY — PHASE 23 (RISKS.md R3); шаблоны форм (`FormTemplate`) и экспорт ответов — вне scope схемы БД этой фазы; referential-валидация PLAYER/SERVER/RANK/PRODUCT/ORDER/REPORT/PUNISHMENT/ACHIEVEMENT-селекторов — по мере соответствующих фаз (PHASE 16/17/18/19, ADR-0027) |
| friends | IMPLEMENTED | PHASE 09 — заявки/приём/отклонение/отмена/блокировка, все friendRequestPolicy, покрыты e2e |
| health | PARTIAL | PHASE 04 — `GET /health` (реальная проверка БД через Prisma); структурные логи/метрики — PHASE 28 |
| leaderboards | IMPLEMENTED | PHASE 19 — 5 реальных рейтингов (playtime/kills/coins/achievements/purchases), покрыто e2e (ADR-0046) |
| minecraft | PARTIAL | PHASE 18 — категории/серверы CRUD, реальный Server List Ping (статус/игроки/история/overview/widget) готовы, покрыты e2e против настоящего TCP-сервера; RCON/доставка игровых команд не предусмотрены схемой (ADR-0041); периодический cron — PHASE 29; audit log — PHASE 22 |
| moderation | IMPLEMENTED | PHASE 16 — quick moderation (mute/warn/kick/ban/hard-delete сообщения и комментария/удаление аккаунта), рассмотрение жалоб на комментарии/профили готовы, покрыты e2e; `users.change_role` заменён RBAC-эндпоинтами PHASE 06 (ADR-0029) |
| news | PARTIAL | PHASE 13 — публичный CRUD/лайки/комментарии/RSS и admin CRUD+модерация готовы, покрыты e2e; загрузка изображений — PHASE 23, автопубликация по расписанию — PHASE 29 |
| notifications | PARTIAL | PHASE 12 — REST/WS/email/push/discord-вебхуки и реальная межмодульная интеграция (friends/comments/activity/direct-messages/chat) готовы, покрыты e2e; периодический cron-дайджест — PHASE 29; push требует VAPID-ключей (RISKS.md R7) |
| positions | PARTIAL | PHASE 07 — CRUD + assign готовы, покрыты e2e; donor-тиры/staff-позиции — по мере необходимости |
| prisma | IMPLEMENTED | PHASE 04 — схема (108 моделей/53 enum) + миграция + PrismaModule |
| redis | PARTIAL | `RedisService` используется для brute-force (PHASE 05), RBAC permission-кеша (PHASE 06), chat presence (PHASE 11); централизованные cache keys/инвалидация — PHASE 24 |
| reports | PARTIAL | PHASE 16 — тикет-система обращений (создание/переписка/assign/status/verdict/заметки/lock/архив/report-ban), история наказаний (`UserPunishment`), donation-problem готовы, покрыты e2e; game-report/game-punishment (внешняя анти-чит интеграция), экспорт и upload вложений — вне scope (ADR-0033, RISKS.md R3) |
| roles (новый модуль, в старом проекте — `RoleGroup`, см. NOT_APPLICABLE) | PARTIAL | PHASE 06 — ядро RBAC и role-management API готовы и покрыты e2e; полный реестр 246 permission keys и staff-роли — по мере доменных фаз и PHASE 32 (ADR-0016) |
| statistics | PARTIAL | PHASE 20 — общий `/admin/dashboard` и `/admin/content/dashboard` готовы, покрыты e2e; `/admin/finance/overview` делегирует в `StoreStatsService` (PHASE 17) |
| store | PARTIAL | PHASE 17 — каталог (категории/товары+варианты/наборы), скидки (bulk/loyalty)/промокоды/валюты, корзина с подарками и единым пересчётом сервером, заказы через PaymentProvider+вебхук (TestPaymentProvider), quick-buy, wishlist, admin-статистика готовы, покрыты e2e; `mock-complete` не перенесён (ADR-0009, PHASE 00); реальный платёжный провайдер — RISKS.md R2; доставка на игровой сервер (RCON) не предусмотрена схемой `Server` (ADR-0041); загрузка изображений — PHASE 23 |
| streaming | PARTIAL | PHASE 14 — публичный список и admin CRUD готовы, покрыты e2e; реальный опрос Twitch/YouTube — PHASE 18/29 (RISKS.md R6) |
| system | MISSING | PHASE 25 |
| topics | PARTIAL | PHASE 14 — публичный CRUD/видимость и admin CRUD+reorder+pin готовы, покрыты e2e; вложения — PHASE 23 (CDN) |
| uploads (→ CDN) | MISSING | PHASE 23 |
| users | PARTIAL | PHASE 07 — admin список/поиск/пагинация + детальная карточка готовы; PHASE 16 — ban/kick/mute/warn/delete-account/жалобы на профиль готовы; PHASE 19 — badges (выдача/отзыв/список) и media-request готовы, покрыты e2e |
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
