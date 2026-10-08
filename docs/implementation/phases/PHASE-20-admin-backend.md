# PHASE 20 — Admin backend

## Сделано

- `modules/admin/` — новый модуль, 4 контроллера на общем префиксе
  `/admin` (как и `UsersController`/`MediaRequestsController` из PHASE 19
  — несколько классов на одном префиксе без коллизий путей):
  - `AdminController` — `/admin/dashboard` (реальные агрегаты: online/
    забаненные/новые сегодня пользователи, pending-жалобы, последние 10
    записей audit log), `/admin/audit-log` + `/audit-log/stats`,
    `/admin/broadcast`, простые KV-настройки `/admin/settings` (модель
    `SiteSetting`).
  - `AdminPanelController` — персональные (per-admin) saved-filters/
    bookmarks (+ reorder)/scheduled-exports CRUD; структурированные
    настройки сайта `/admin/settings/site` (singleton `SiteSettings`,
    создаётся по первому GET); security (`sessions`/`suspicious`/
    `logins`/`ip-whitelist`); `/admin/content/dashboard`; `/admin/
    finance/overview|transactions|refunds|export` — overview и export
    делегируют в уже существующие `StoreStatsService`/`OrdersService`
    (PHASE 17), не дублируют агрегацию.
  - `AdminUsersBulkController` — `PATCH /admin/users/bulk` (BAN/UNBAN),
    единственное новое место в коде, где массовое действие над
    пользователями проверяет priority-иерархию через уже существующий
    `PermissionService.canActOn` (ADR-0050).
  - `ExportController` — `/admin/{users,orders,reports,news,audit-log}/
    export`, CSV напрямую в HTTP-ответ (нет файлового хранилища — PHASE
    23), hand-rolled RFC4180-сериализатор, без новой зависимости.
- `AuditService` — `log()` (ошибка проглатывается для info/warning,
  **падает** для critical — чтобы критичное действие не осталось без
  следа молча), `list()`/`getStats()` (read-эндпоинты), `cleanupOld()`
  (90 дней retention, реализован и протестирован, периодический вызов —
  PHASE 29). Логирование подключено только для действий ЭТОЙ фазы
  (`settings.update`, `settings.site.update`,
  `security.ip_whitelist.update`, `notification.broadcast`, `user.ban`/
  `user.unban`) — полное ретроактивное покрытие остальных доменов
  вынесено в PHASE 22 (ADR-0047).
- `QuickModerationService.unban()` — новый метод (симметричный уже
  существующему `ban()`, PHASE 16): account-level разбан, отдельно от
  `ReportBan`/`unbanUser` (PHASE 16, другая модель). Экспортирован из
  `ModerationModule` для переиспользования в `admin`.
- `OrdersService.listAdmin()`/`ListAdminOrdersQueryDto` (Store, PHASE 17)
  расширены фильтрами `userId`/`dateFrom`/`dateTo` — нужны и
  `/admin/orders`, и новому `/admin/finance/transactions`, без
  дублирования логики листинга заказов.
- 35 новых permission-ключей (`dashboard.view`, `audit_log.*`,
  `broadcast.create`, `settings.*`, `saved_filters.*`, `bookmarks.*`,
  `exports.scheduled.*`, `security.*`, `content.view`, `finance.*`,
  `users.bulk.edit`, `users.export`, `orders.export`, `reports.export`,
  `news.export`).

## Проверено реальным запуском

`apps/api/test/admin.e2e-spec.ts` — **16 тестов** против реального
Postgres+Redis: permission-gating (403 без прав) на выборке эндпоинтов;
dashboard отдаёт реальные агрегаты; KV- и структурированные настройки
сайта читаются/пишутся, структурированные — с audit-diff в
`changes`; broadcast реально создаёт `Announcement` и доставляет
`Notification` (type=ANNOUNCEMENT) целевым пользователям по `targetRole`
(проверено на изолированной тестовой роли — не затрагивает пользователей
других параллельно идущих e2e-сьютов на той же БД); audit-log список и
статистика видят только что созданные записи; saved-filters/bookmarks
(+reorder)/scheduled-exports — полный CRUD; security/sessions и /logins
— реальные `RefreshToken` тестовых пользователей; security/suspicious —
реальное чтение Redis через `SCAN` (на specially-crafted фейковом IP, не
на `127.0.0.1` — чтобы не заблокировать реальные логины остального
сьюта на 15 минут); ip-whitelist пишет в singleton; content/finance —
реальные агрегаты по News/Form/Order; все 5 export-эндпоинтов + finance/
export отдают `text/csv` с заголовком; users/bulk — BAN/UNBAN с
audit-записью на каждого, и отдельно проверено, что действие над
пользователем ТОГО ЖЕ priority (включая самого себя) корректно
отклоняется в `failed[]`, не кладёт весь batch 500-кой.

Полный набор из корня (23 e2e suite, 194 теста) + `lint`/`format:check`/
`typecheck`/`build` — все зелёные.

## Не входит в эту фазу

- Ретроактивное `audit.log()` для всех staff-мутаций остальных 15+
  доменов (store/news/forms/topics/achievements/servers/moderation и
  т.д., см. `docs/technical/25-AUDIT-LOG.md`) — PHASE 22.
- Фактическое выполнение `ScheduledExport` по расписанию (cron) — PHASE
  29; сейчас только CRUD-хранение, `nextRunAt`/`lastRunAt` не
  вычисляются.
- Персистентная модель истории входов/подозрительной активности —
  `security/logins`/`security/suspicious` честно читают существующие
  `RefreshToken`/Redis-счётчики brute-force (ADR-0049), не изобретают
  новую модель.
- Реальное обеспечение `requireAdmin2fa` — поле сохраняется, но
  механизма 2FA в проекте нет вообще, ни в одной фазе (ADR-0050).
- Единый `AuditService` для всех будущих доменов остаётся прежним (уже
  экспортирован из `AdminModule`) — PHASE 22 будет только добавлять
  вызовы `log()` в существующие сервисы, не менять сам сервис.
