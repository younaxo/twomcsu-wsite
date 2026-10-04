# PHASE 14 — Events / Topics / Voting / Streaming

Четыре независимых домена, объединённые ROADMAP в одну фазу. 27 новых
permission-ключей (events: 7, topics: 10, voting: 5, streams: 5).

## Events

- `modules/events` — публичный `EventsController`: список (optional auth,
  фильтр по видимости PUBLIC/AUTHENTICATED/STAFF), `featured`, `mine`
  (мои события — организатор либо участник), деталь по slug (с
  `myStatus` для viewer), `POST/DELETE :id/attendance` (GOING/INTERESTED/
  DECLINED, с проверкой `maxParticipants` и `registrationDeadline`).
- `EventsAdminController` (6 permission-ключей): CRUD, `publish`/`cancel`
  (`DRAFT → PUBLISHED`/`CANCELLED`, сохраняет `publishedAt`).
- Изменение расписания (`startsAt`/`endsAt`/`location`) уже опубликованного
  события или его отмена создаёт `EVENT_UPDATED` всем участникам
  (GOING/INTERESTED) через `NotificationsService`.
- `events.view.staff` — отдельный permission-ключ вместо RoleGroup-проверки
  видимости STAFF (ADR-0024).

## Topics

- `modules/topics` — публичный `TopicsController`: список и деталь по
  slug с фильтрацией по `TopicVisibility` через permission-ключи
  (`topics.view.helper`/`.moderator`/`.admin`/`.owner` — ADR-0024);
  PUBLIC видно всем, AUTHENTICATED — любому залогиненному. Просмотр
  увеличивает счётчик `views`.
- `TopicsAdminController` (6 permission-ключей): CRUD, `reorder`
  (пакетное изменение `order`), `pin`/`unpin`.
- Вложения (`TopicAttachment`, upload) не входят в эту фазу — требуют
  CDN-пайплайна, PHASE 23 (как news upload-image, profile avatar/banner).

## Voting

- `modules/voting` — публичный `VotingController`: `GET /voting`
  (активные vote-сайты без секрета; для авторизованного viewer — его
  `nextVoteAt`/`canVoteNow` по cooldown), `POST /voting/webhook/:slug`
  (публичный, без auth — вызывается внешним vote-сайтом).
- `VotingAdminController` (5 permission-ключей): CRUD сайтов,
  `rotate-secret`. Сырой webhook-секрет возвращается администратору ровно
  один раз (при создании и при rotate) — хранится только bcrypt-хеш
  (ADR-0025, тот же паттерн, что и пароли).
- Webhook всегда отвечает `200 { accepted, reason? }` — никогда не
  4xx/5xx для бизнес-отказов (`invalid_secret`/`user_not_found`/
  `cooldown`), только 404 для несуществующего/неактивного slug.
- Успешный голос начисляет `rewardCoins` в `PlayerStatistics.coins`
  (upsert) и создаёт запись `PlayerVote`; повторный голос в пределах
  `cooldownHours` отклоняется без начисления.

## Streaming

- `modules/streaming` — публичный `StreamingController`: `GET /streams`
  (активные каналы). `StreamingAdminController` (5 permission-ключей):
  CRUD каналов, `refresh` (ADR-0026 — честно сообщает об отсутствии
  `TWITCH_CLIENT_ID/SECRET`/`YOUTUBE_API_KEY`, не падает и не выдаёт
  моковые данные; см. RISKS.md R6).
- `UpdateStreamChannelDto` намеренно не включает `isLive`/`viewerCount`/
  `title`/`thumbnailUrl`/`liveUrl`/`startedAt` — эти поля отражают факт
  из внешнего API, не ручной ввод; попытка передать их через `PATCH`
  отклоняется `ValidationPipe` (`forbidNonWhitelisted`) явным 400, не
  молчаливым игнорированием — поймано и исправлено в собственном e2e-тесте
  (сначала тест ошибочно ожидал тихое игнорирование).

## Проверено реальным запуском

4 новых e2e-файла, **21 тест**, все прошли:
`events.e2e-spec.ts` (5), `topics.e2e-spec.ts` (5), `voting.e2e-spec.ts`
(6), `streaming.e2e-spec.ts` (5) — против реального Postgres+Redis.
Полный набор из корня (15 e2e suite, 99 тестов) + `lint`/`format:check`/
`typecheck`/`build`/`test` — все зелёные.

## Не входит в эту фазу

- Реальный опрос Twitch/YouTube и периодический cron обновления статуса
  стримов — PHASE 18/29 (ADR-0026, RISKS.md R6).
- `EVENT_REMINDER` (периодическое напоминание о предстоящем событии) —
  требует cron, PHASE 29; `EVENT_UPDATED` (немедленный, не периодический
  триггер) уже реализован.
- Загрузка вложений к темам (`TopicAttachment`) — PHASE 23 (CDN).
- Полный Markdown/rich-text рендеринг контента тем и событий — используется
  безопасный escape (как и в news/chat/comments), полноценный Markdown +
  sanitize-html allowlist — отдельная кросс-модульная задача (см. PHASE-09).
