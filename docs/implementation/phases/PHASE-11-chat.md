# PHASE 11 — Chat

## Сделано

- `modules/chat` (REST, `@Controller('chat')`, публичный): список активных
  каналов, получение канала по slug (404 для несуществующего/отключённого —
  не отличается внешне), история сообщений (пагинация), список онлайн
  (Redis `chat:online:{channelId}`), закреплённые сообщения.
- `AdminChatController` (`@Controller('admin/chat')`, permission-gated):
  CRUD каналов, листинг/снятие мутов и банов, поиск по сообщениям,
  получение сообщения по id. 14 новых permission-ключей модуля `chat`
  (`chat.channels.*`, `chat.messages.*`, `chat.mutes.*`, `chat.bans.*`).
  Отправка сообщений — **только через WebSocket**, REST не имеет
  POST-эндпоинта для создания сообщения (соответствует
  `docs/technical/04-API-REFERENCE.md`: `ChatController` без POST-маршрутов).
- `ChatGateway` (Socket.IO, namespace `/chat`, `docs/technical/06-WEBSOCKET.md`):
  rooms `user:{userId}`/`channel:{channelId}`. `join_channel`/`leave_channel`
  (presence в Redis + broadcast `user:online`/`user:offline`), `send_message`
  (проверяет чат-бан/мут/`isReadOnly`+`chat.messages.post_readonly`),
  `edit_message` (только автор), `delete_message` (автор либо
  `chat.messages.delete`), `typing_start`/`typing_stop` (остальным, не
  отправителю), `pin_message` (`chat.messages.pin`), `mute_user`/`ban_user`
  (`chat.mutes.create`/`chat.bans.create`).
- Аутентификация — тот же паттерн namespace-middleware, что и в
  `DirectMessagesGateway` (PHASE 10): токен проверяется в `afterInit` →
  `server.use(...)` до события `connection`, чтобы исключить гонку с
  `@SubscribeMessage`-обработчиками. Дополнительно: активный `ChatBan`
  (не привязан к каналу в схеме) проверяется прямо при аутентификации —
  забаненный в чате не может установить WS-соединение вообще.
- Намеренные отличия от старого проекта (`docs/technical/29-SECURITY.md`
  S12): `join_channel` проверяет существование и активность канала (тихо
  не выполняет join, если канала нет); `mute_user`/`ban_user` публично
  рассылают только минимальный payload (`{userId, channelId?}` /
  `{userId}`) без причины — полные детали (`reason`, `reasonNote`,
  `mutedUntil`/`bannedUntil`) уходят только в личную комнату цели
  (`user:{userId}`), а не всем сокетам namespace, как было в старом коде.

## Реальный баг, пойманный e2e-тестами

Первая версия `onLeaveChannel` вызывала `client.leave(room)` **до** broadcast
`user:offline` — вышедший сокет к моменту emit уже не состоял в комнате и не
получал подтверждение собственного выхода. Тест `join_channel присоединяет...`
(проверяющий цикл join → online → leave → offline) завис на ожидании
`user:offline` и упал по таймауту. Исправлено: порядок изменён на
emit-затем-leave (симметрично `join_channel`, где `client.join()` выполняется
до emit, чтобы включить присоединившегося в рассылку).

Отдельно: после добавления 14 новых permission-ключей в
`prisma/seed/permissions.ts` первый прогон e2e всей WebSocket-секции падал
с `BadRequestException` на каждом тесте — причина не в коде, а в том, что
локальная dev-база ещё не содержала новых permission-записей (seed меняет
только исходный файл, не применяется к уже поднятой БД автоматически).
Исправлено запуском `prisma db seed` вручную; в CI это не воспроизводится,
так как pipeline применяет migrate+seed с нуля на каждый прогон.

## Проверено реальным запуском

`apps/api/test/chat.e2e-spec.ts` — **12 тестов** против реального
Postgres+Redis+живого Socket.IO-сервера, все прошли:
- admin REST создание канала требует `chat.channels.create` (403 без прав);
- публичные REST (список/получение/история/онлайн/закреплённые) на пустом
  канале отдают корректные пустые структуры;
- несуществующий канал → 404;
- `join_channel` → `user:online` + отражается в REST `/online`;
  `leave_channel` → `user:offline` + пропадает из `/online`;
- `send_message` рассылает `message:new` всем в комнате канала;
- `edit_message`: чужая правка — ошибка, авторская — `message:edited`;
- `typing_start` доходит до собеседника, но не возвращается отправителю;
- `pin_message`: без permission — ошибка, с permission — `message:pinned`;
- `delete_message` автором — `message:deleted` (soft delete);
- `mute_user`: публичное событие без причины + личное с деталями,
  блокирует `send_message` до снятия мута через admin REST;
- `ban_user`: личные детали в `user:{id}`, публичный минимальный payload
  всем, принудительный disconnect, повторное подключение отклоняется до
  unban через admin REST;
- read-only канал требует `chat.messages.post_readonly` для отправки.

Полный набор из корня (9 e2e suite, 57 тестов) + `lint`/`format:check`/
`typecheck`/`build`/`test` — все зелёные.

## Не входит в эту фазу

- `GET/PATCH /admin/chat/settings` — в старом проекте это узкий срез
  глобального singleton `SiteSettings` (поля `chatEnabled`/`autoModeration`/
  `profanityFilter`), а не отдельная chat-специфичная таблица. Полноценное
  управление `SiteSettings` — предмет PHASE 25 (System); делать для него
  отдельный admin-эндпоинт только ради chat сейчас означало бы наполовину
  реализовать чужую фазу.
- Anti-spam (rate limit на уровне гейтвея) — `ThrottlerGuard` для WS не
  подключён, как и в старом проекте (S10); отдельная кросс-модульная задача
  вместе с PHASE 29 (Background jobs) / PHASE 26 (Security hardening).
- TTL-based presence (устойчивость `chat:online:{channelId}` к обрыву
  соединения без явного `leave_channel`) — сейчас presence не чистится на
  `handleDisconnect`, только на явный `leave_channel`; следующий join/leave
  восстанавливает консистентность. Приемлемо для MVP, зафиксировано как
  возможное улучшение.
- Полнотекстовый поиск по сообщениям использует `contains`/`ILIKE`
  (`admin/chat/messages/search`), не полноценный full-text search индекс —
  достаточно для текущего объёма, пересмотр — PHASE 34 (Performance).
- Emoji-реакции на сообщения чата — не описаны в задании для этого модуля
  (в отличие от комментариев/активности/ЛС); `ChatMessageReaction` как
  таблица сознательно не создавалась ещё на PHASE 04 (см. COVERAGE.md).
