# PHASE 10 — Direct Messages

## Сделано

- `modules/direct-messages` (REST, `@Controller('messages')`): личные и
  групповые беседы (`POST /messages/conversations/direct|group`, идемпотентно
  для личных — повторный вызов с тем же собеседником возвращает ту же
  беседу через `directKey`), `GET /messages/conversations`, `GET
  /messages/conversations/:id` (404 для не-участника — не раскрывает
  существование беседы), список/отправка/редактирование/удаление (soft)
  сообщений, реакции (свободный emoji, `messageId_userId_emoji` — несколько
  разных emoji от одного пользователя одновременно, в отличие от комментариев),
  `markRead` (unread count в списке бесед), выход из беседы, инвайты в
  групповые беседы (код, `maxUses`, `expiresAt`, отзыв).
  - `directMessagePolicy` (`EVERYONE`/`FRIENDS`/`FRIENDS_OF_FRIENDS`/`NOBODY`)
    проверяется полностью, `FRIENDS_OF_FRIENDS` — через
    `FriendsService.areFriendsOfFriends` (PHASE 09).
- `DirectMessagesGateway` (`@nestjs/websockets`, Socket.IO, namespace
  `/messages`, `docs/technical/06-WEBSOCKET.md`): `conversation:join/leave`,
  `message:send` (ack `{ok, message}`/`{ok:false, error}` + broadcast
  `message:new`+`conversation:changed`), `message:edit/delete/react` (→
  `message:updated`), `conversation:read` (→ receipt всем участникам комнаты),
  `typing:start/stop` (всем в комнате, кроме отправителя). Сокет при
  подключении автоматически входит в `messages:user:{id}` и во все
  `messages:conversation:{id}` своих бесед.
- Аутентификация WS вынесена в namespace-middleware (`afterInit` →
  `server.use(...)`), а не в `handleConnection` — см. «Реальный баг,
  пойманный e2e-тестами» ниже.
- `ConfigurableIoAdapter` (`apps/api/src/websocket-adapter.ts`) — единая точка
  конфигурации CORS для всех будущих Socket.IO namespace через
  `ConfigService`, регистрируется в `configureApp()` (см. ADR-0017).
- Валидация socket-событий — тот же `ValidationPipe` (`whitelist`,
  `forbidNonWhitelisted`, `transform`), что и на REST, через `@UsePipes` на
  уровне гейтвея; socket-DTO расширяют REST DTO (см. ADR-0018).

## Реальный баг, пойманный e2e-тестами (не придуман заранее)

Первая версия `handleConnection` проверяла JWT и выставляла
`client.data.userId` асинхронно внутри самого хука жизненного цикла.
Nest привязывает `@SubscribeMessage`-обработчики к сокету уже в момент
события `connection`, **не дожидаясь** завершения асинхронного тела
`handleConnection`. E2e-тест `typing:start доходит до собеседника` поймал
гонку: клиент подключался и почти сразу слал событие — обработчик иногда
успевал выполниться раньше, чем `client.data.userId` был установлен,
`DirectMessagesService.requireMember` получал `undefined` и падал на
Prisma-валидации (проглатывалось общим `catch`, событие тихо терялось).
Тест `conversation:join` для чужака ловил тот же баг с другой стороны
(ack `message:send` оказывался `{ok:false}` без видимой причины).
**Исправлено**: проверка токена перенесена в Socket.IO namespace-middleware
(`afterInit` → `server.use`), которое Socket.IO гарантированно прогоняет **до**
события `connection` — к моменту, когда вообще может быть вызван любой
`@SubscribeMessage`-обработчик, `client.data.userId` уже точно установлен.

## Проверено реальным запуском

`apps/api/test/direct-messages.e2e-spec.ts` — **12 тестов** против реального
Postgres+Redis+живого TCP-листенера (`app.listen(0)`, `socket.io-client`),
все прошли:
- `NOBODY`/`FRIENDS`/`FRIENDS_OF_FRIENDS` блокируют чужаков, нельзя писать
  себе;
- создание личной беседы идемпотентно (`directKey`);
- чужак получает 404 на `GET conversation`/`messages` (не 403 — не
  подтверждает существование);
- REST: отправка → список → редактирование (чужая правка 403) → реакция
  toggle → удаление;
- `markRead` обнуляет `unreadCount` в списке бесед;
- групповая беседа: создание → инвайт (`maxUses`) → вступление по коду →
  выход → 404 для вышедшего;
- WebSocket: без токена — `connect_error`/disconnect; с токеном — авто-join
  комнаты беседы; `message:send` → ack + `message:new` + `conversation:changed`
  собеседнику; `typing:start` доходит до собеседника, но не возвращается
  отправителю; `message:react`/`message:edit` → `message:updated` **обеим**
  сторонам комнаты; чужак, не состоящий в беседе, не получает её сообщения
  даже после попытки `conversation:join`.

Полный набор из корня (8 e2e suite, 45 тестов) + `lint`/`format:check`/
`typecheck`/`build`/`test` — все зелёные. См. также RISKS.md R13 — под полным
параллельным e2e-сьютом хук `beforeAll` нескольких файлов (не только этого)
потребовал увеличения таймаута Jest из-за конкуренции за ресурсы, не из-за
логической регрессии.

## Не входит в эту фазу

- Вложения к сообщениям (`MessageAttachment` в схеме уже есть, загрузка файлов
  — PHASE 23, CDN/Files).
- Уведомления о новых сообщениях (website/push) — PHASE 12 (Notifications).
- Rate limiting на уровне WS-гейтвея (`ThrottlerGuard` для WS не подключён) —
  как и зафиксировано для старого проекта в `29-SECURITY.md` S10; антиспам для
  реал-тайм каналов рассматривается централизованно вместе с PHASE 11 (Chat).
- Полнотекстовый поиск по сообщениям, закрепление сообщений, медиа-превью.
