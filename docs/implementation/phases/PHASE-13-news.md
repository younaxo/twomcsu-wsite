# PHASE 13 — News

## Сделано

- `modules/news` — публичный `NewsController` (`@Controller()`, без общего
  префикса — совмещает `/news/*` и `/rss/news`, как в старом проекте):
  список (пагинация, фильтр по категории/тегу), `featured`/`latest`/
  `popular`, `categories`/`tags` (агрегация с count), `GET /rss/news` (RSS
  2.0, генерируется вручную), `GET /news/:slug` (увеличивает `viewsCount`,
  отдаёт `liked` для текущего viewer), `POST /news/:id/like` (toggle),
  комментарии (список/создание/редактирование-автором/удаление-автором/
  toggle-реакция свободным emoji).
- `NewsAdminController` (`/admin/news`, 6 permission-ключей модуля `news`):
  CRUD (создание с тегами, редактирование, архивация вместо hard delete —
  ADR-0023), список с фильтрами (status/category/search), статистика
  (по статусам + суммарные views/likes/comments), pin/unpin, feature/
  unfeature.
- `NewsModerationController` (`/moderation/news/comments`): pin/unpin и
  удаление чужого комментария модератором (`news.comments.pin`/
  `news.comments.delete`), независимо от авторства.
- Межмодульная интеграция: `like()` → `NEWS_LIKED` автору новости (кроме
  самолайка); создание комментария → `NEWS_COMMENT_REPLY` автору
  родительского комментария (при `notifyOnReply`), `NEWS_COMMENT_MENTION`
  упомянутым (при `notifyOnMention`, вычисляется на лету — ADR-0023).

## Проверено реальным запуском

`apps/api/test/news.e2e-spec.ts` — **11 тестов** против реального
Postgres+Redis, все прошли: создание требует `news.create` (403 без прав);
черновик недоступен публично (404) и виден админу по id; публикация через
`PATCH` делает новость видимой, увеличивает `viewsCount`; публичные
список/featured/latest/categories/tags/RSS корректно отражают
опубликованную новость; pin/feature переключаются и влияют на выдачу;
like переключается и создаёт `NEWS_LIKED`; комментарии — создание/список/
редактирование только автором/ответ создаёт `NEWS_COMMENT_REPLY` и
`NEWS_COMMENT_MENTION`; реакция на комментарий переключается; модерация
(pin/delete чужого комментария) permission-gated; `allowComments=false`
запрещает комментирование; admin список с фильтрами/статистика/архивация
скрывает из публичного списка.

Полный набор из корня (11 e2e suite, 78 тестов) + `lint`/`format:check`/
`typecheck`/`build`/`test` — все зелёные.

## Не входит в эту фазу

- Автоматический переход `SCHEDULED → PUBLISHED` по расписанию — требует
  cron, PHASE 29 (ADR-0023). Статус `SCHEDULED`/`scheduledFor` принимаются
  и сохраняются, переход сейчас только ручной.
- `POST /admin/news/upload-image` — загрузка обложки/изображений требует
  полноценного CDN-пайплайна (magic-bytes, AVIF, S3) — PHASE 23, как и
  avatar/banner профиля (PHASE 08). Поля `coverImage`/`ogImage` принимают
  строку (storage key) уже сейчас, просто без backend-эндпоинта загрузки.
- Автоматическая рассылка `NEWS_PUBLISHED` всем пользователям при публикации
  — не реализована как автоматика (могла бы быть слишком шумной без
  механизма подписки на новости, которого нет в требованиях); тип остаётся
  доступным для ручного `POST /admin/notifications/broadcast` (PHASE 12).
- Time-windowed «популярное за период» — сейчас `popular()` сортирует по
  `viewsCount` за всё время (ADR-0023); пересмотр — PHASE 34.
