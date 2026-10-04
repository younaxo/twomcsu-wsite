# PHASE 12 — Notifications

## Сделано

- `modules/notifications` — ядро (`NotificationsService.create()` — единая
  точка создания уведомления для всех доменных модулей): проверка точного
  per-type рубильника (`NotificationSettings.typeSettings`), запись в БД,
  WS realtime (всегда), затем доставка по каналам (email/push/discord) с
  учётом `quietHours` (кроме `priority: URGENT`, который их пробивает) и
  `digestMode` (email не шлётся немедленно, если режим не `INSTANT`).
- REST `/notifications/*` (приватный, `JwtAuthGuard`): список/unread-count/
  read/read-all/remove, settings (get/update/updateType/reset), push
  (vapid-key/subscribe/unsubscribe), личный Discord-вебхук (save/delete/
  test), digest (update/test).
- REST `/admin/notifications/*` (permission-gated, 6 новых ключей модуля
  `notifications`): CRUD системных Discord-вебхуков, массовая рассылка
  (`broadcast`, ограничена типами `ANNOUNCEMENT`/`MAINTENANCE`/`SYSTEM` —
  остальные `NotificationType` создаются только доменными сервисами),
  агрегированная статистика (`stats`).
- `NotificationsGateway` (Socket.IO, namespace `/notifications`, только
  server→client): та же схема аутентификации через namespace-middleware,
  что и в Chat/DirectMessages (PHASE 10/11); единственное событие
  `notification:new` в личную комнату `user:{userId}`.
- `PushService` (обёртка над `web-push`) и `EmailService` (PHASE 05) — без
  `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` push молча выключается (тот же
  паттерн, что и SMTP, см. RISKS.md R7); при 404/410 от push-сервиса
  браузера истёкшая `PushSubscription` удаляется сразу, не дожидаясь cron.
- `DiscordService` — отправка в вебхук (личный и системные), CRUD системных
  вебхуков; `discord-webhook-url.util.ts` — allowlist `discord.com`/
  `discordapp.com` против SSRF, применён в обоих местах приёма URL от
  клиента (ADR-0020).
- **Межмодульная интеграция** (реальные вызовы `NotificationsService.create`,
  не просто готовая, но не используемая инфраструктура):
  - `FriendsService.sendRequest`/`acceptRequest` → `FRIEND_REQUEST`/
    `FRIEND_ACCEPTED` (при `User.notifyOnFriendRequest` получателя).
  - `CommentsService.create` → `COMMENT_ON_PROFILE` владельцу профиля,
    `COMMENT_REPLY` автору родительского комментария, `COMMENT_MENTION`
    каждому упомянутому (каждое — при соответствующем `notifyOn*`).
  - `ActivityService.comment` → `ACTIVITY_COMMENT` владельцу записи (при
    `ActivityFeedSettings.notifyOnComment`), `ACTIVITY_COMMENT_MENTION`
    упомянутым — новые значения `NotificationType` (ADR-0021, миграция
    `20261004144405_add_activity_notification_types`).
  - `DirectMessagesService.sendMessage` → `MESSAGE_RECEIVED` остальным
    участникам беседы, кроме замьютивших её (`ConversationMember.isMuted`).
  - `ChatService.sendMessage` → `CHAT_MENTION` упомянутым в публичном чате.

## Реальная находка при написании e2e-тестов

Один из тестов отключал `typeSettings.FRIEND_REQUEST` и проверял
"уведомление не создано" через `items.some(n => n.type === 'FRIEND_REQUEST')`
— но предыдущий тест в этом же файле уже создавал и помечал прочитанным
такое же уведомление (не удалял его), поэтому проверка на простое
"присутствие в списке" была в принципе неверной методикой (ложно-зелёной,
если бы баг действительно был, и ложно-красной, как случилось при первом
прогоне). Переписано на сравнение `count` того же типа до/после действия —
корректно отражает "создалась ли НОВАЯ запись", не завися от истории
предыдущих тестов. Заодно добавлена защитная очистка `friendship` в начале
нескольких тестов (не только в конце) — упавший `expect` обрывает тест до
`afterAll`-подобной очистки в конце теста, оставляя `PENDING`-заявку,
которая каскадно ломает все последующие тесты, создающие ту же пару.

Отдельно обнаружен реальный пробел в SSRF-защите: `isValidDiscordWebhookUrl`
была изначально подключена только в `DiscordService` (admin CRUD системных
вебхуков), но не в `NotificationSettingsService.saveDiscordWebhook` (личный
вебхук пользователя) — e2e-тест с заведомо недопустимым URL
(`https://evil.example.com/steal`) ожидал 400, получил 201. Исправлено —
проверка добавлена в оба места приёма URL от клиента.

## Проверено реальным запуском

`apps/api/test/notifications.e2e-spec.ts` — **10 тестов** против реального
Postgres+Redis+живого Socket.IO-сервера, все прошли: реальная заявка в
друзья создаёт `FRIEND_REQUEST`; комментарий с упоминанием создаёт
`COMMENT_MENTION`; `typeSettings` реально блокирует создание конкретного
типа; settings get/update/reset; push vapid-key честно сообщает
`configured: false` без `VAPID_*` в этом окружении, subscribe/unsubscribe
работают; личный Discord-вебхук — невалидный URL отклоняется (400),
валидный сохраняется/тестируется/удаляется; digest test не шлёт письмо без
непрочитанных и шлёт при их наличии; admin CRUD вебхуков/broadcast/stats
permission-gated и работают; WS без токена отклоняется, с токеном —
реальное доменное событие (заявка в друзья) доходит до получателя в
реальном времени.

Полный набор из корня (10 e2e suite, 67 тестов) + `lint`/`format:check`/
`typecheck`/`build`/`test` — все зелёные. Ни один из существующих тестов
(friends/comments/activity/direct-messages/chat) не сломан интеграцией —
`NotificationsModule` сделан `@Global()` именно чтобы доменные сервисы
могли внедрить `NotificationsService` без изменения своих `*.module.ts`.

## Не входит в эту фазу

- Реальный периодический cron-дайджест по `digestMode`/`digestTime` —
  PHASE 29 (Background jobs), см. ADR-0022. Сейчас есть только ручной
  `POST /notifications/digest/test`.
- Реальная push-доставка требует `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` —
  внешний блокер RISKS.md R7; `vapid-key` эндпоинт и вся инфраструктура
  готовы, активируются простой установкой переменных окружения.
- Уведомления для ещё не реализованных доменов (news/reports/store/
  achievements/events/gifts) — `NotificationType` уже резервирует значения
  под них, вызовы `NotificationsService.create()` добавятся вместе с
  реализацией соответствующих фаз (тот же паттерн, что и activity-источники
  в PHASE 09).
- TTL-based cleanup истёкших `PushSubscription`, не затронутых реальной
  отправкой (подписка, которую никогда не пытались использовать) —
  периодическая задача, PHASE 29.
