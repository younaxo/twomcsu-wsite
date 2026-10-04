# PHASE 16 — Reports / Moderation

## Сделано

- `modules/moderation` — `QuickModerationController` (быстрые действия в
  один клик из контекста): `POST /moderation/users/:userId/mute|warn|kick|
  ban`, `POST /moderation/messages/:messageId/hard-delete` (ChatMessage),
  `POST /moderation/comments/:commentId/hard-delete` (ProfileComment),
  `DELETE /admin/users/:userId` (удаление аккаунта, с переводом FK-конфликта
  в понятную 403 вместо сырой 500). `mute`/`warn`/`kick`/`ban` создают
  `UserPunishment`; `kick` разрывает refresh-сессии
  (`AuthService.revokeAllSessions`), `ban` дополнительно выставляет
  `User.isBanned`/`banReason`/`bannedUntil` — эффект мгновенный на каждый
  следующий запрос (`JwtStrategy.validate()`, PHASE 05) — см. ADR-0030,
  ADR-0031.
  `users.change_role` не перенесён — заменён уже существующими
  `POST/DELETE /admin/users/:userId/roles/:roleId` (PHASE 06) — ADR-0029.
- `ContentReportsController` (`/admin/comment-reports`, `/admin/
  profile-reports`) — список с фильтром по статусу и рассмотрение
  (`RESOLVED`/`REJECTED` + `reviewNote`) жалоб на комментарии профиля
  (`CommentReport`, создание уже было в PHASE 09) и на профили
  (`ProfileReport` — создание добавлено в этой фазе: `POST /users/
  :username/report` в `profiles.controller.ts`, запрет пожаловаться на
  самого себя).
- `modules/reports` — тикет-система обращений (`Report` + `ReportTarget` +
  `ReportEvidenceLink` + `ReportMessage` + `ReportModeratorNote` +
  `ReportBan`):
  - Публичный `ReportsController`: `GET /reports/rules` (страница правил —
    конкретная `Topic` по slug, `null` если администратор её не создал),
    `GET /reports` (мои обращения), `GET /reports/:reportNumber` (автор или
    staff с `reports.view`, иначе 403), `POST /reports` (создание — цели
    резолвятся по username в `userId`, если такой пользователь
    зарегистрирован), `POST .../messages` / `PATCH .../messages/:id`
    (только автор, только пока `!isLocked`), `POST /support/
    donation-problem` (создаёт `Report` с `type=DONATION_PROBLEM`).
  - `ReportsModerationController` (`/moderation/reports`, 10
    permission-ключей, HELPER-уровень): список, assign, смена статуса,
    вердикт (с опциональным переходом статуса), staff-сообщения,
    мягкое удаление сообщения, pin/unpin сообщения, CRUD заметок
    модератора + pin (заметки не видны автору — не включаются в ответ,
    если viewer не staff), lock/unlock (один эндпоинт, `locked: boolean`).
  - `ReportsAdminController` (`/admin/reports`, `/admin/support`,
    ADMIN-уровень): статистика (по статусам/типам), архив (отдельный
    список, не удаление), восстановление из архива, безвозвратное
    удаление обращения, безвозвратное удаление сообщения, бан/разбан в
    тикет-системе (`ReportBan`, независим от `User.isBanned` — ADR-0032),
    список обращений по проблемам с донатом.
  - `PunishmentsController`: `GET /users/me/punishments`, `GET /admin/
    users/:username/punishments`, `POST /admin/users/:userId/punishments`
    (явный выбор `PunishmentType`/`duration`/`server`/`expiresAt`),
    `PATCH .../punishments/:id`.
  - `reportNumber` — формат `R-YYYYMMDD-XXXXXX` (6 hex из `randomBytes(3)`),
    retry-цикл на коллизию (ADR-0032).

## Проверено реальным запуском

`apps/api/test/moderation.e2e-spec.ts` — **20 тестов** (mute/warn создают
`UserPunishment`, permission-gated; kick реально разрывает refresh-сессию
— `POST /auth/refresh` после kick даёт 401; ban мгновенно блокирует доступ
по уже выданному access-token и отклоняет логин (403, не 401 — различается
от неверных credentials), повторный бан отклоняется; hard-delete сообщения/
комментария безвозвратно удаляют запись (включая каскад ответов для
комментария); delete-account: реальный FK-конфликт (пользователь — автор
`Report`) переводится в 403, после устранения конфликта — удаление
проходит; жалобы на комментарии и на профили — list/review модератором,
самопожалоба на профиль отклоняется).

`apps/api/test/reports.e2e-spec.ts` — **12 тестов** (rules без Topic/с
Topic; создание обращения резолвит target по username, формат
reportNumber; report-ban блокирует создание обращений до unban; доступ
чужому пользователю — 403, автору/staff — 200; сообщения автора создание/
редактирование только автором; модерация — список/assign/status/
staff-сообщение (isStaff=true)/pin-unpin/verdict с переходом статуса;
заметки модератора — CRUD/pin, не видны автору; lock блокирует новые
сообщения автора, unlock снимает; admin — статистика/архив/разархивация/
hard-delete сообщения/удаление обращения; donation-problem создание и
просмотр администратором; наказания — выдача/обновление/список по
username).

Полный набор из корня (18 e2e suite, 136 тестов) + `lint`/`format:check`/
`typecheck`/`build`/`test` — все зелёные.

## Не входит в эту фазу

- `GET /game-reports`, `/users/:username/game-reports/incoming|outgoing`,
  `/bans` (listActiveGamePunishments), `/users/:username/
  punishments-history`, `/users/me/game-punishments` — завязаны на
  `GameReport`/`GamePunishment`, STUB-интеграцию с внешними игровыми
  плагинами (TigerReports/LiteBans), уже зафиксированную NOT_APPLICABLE в
  COVERAGE.md (PHASE 00). Их реальный аналог — `UserPunishment` —
  полностью реализован (ADR-0033).
- `POST /admin/reports/export` (экспорт ответов), upload вложений
  (`/reports/:reportNumber/attachments`, `.../messages/:messageId/
  attachments`) — зависят от `StorageService` (PHASE 23, RISKS.md R3).
- `GET /admin/forms/templates`-подобного шаблонизатора для Reports нет в
  требованиях — не создавался.
- Автоматические переходы статуса обращения (например, авто-`WAITING_
  RESPONSE` после ответа staff) — не реализованы: статус меняется только
  явно через `reports.status`/`reports.verdict`, чтобы не вводить
  неописанную в требованиях бизнес-логику.
