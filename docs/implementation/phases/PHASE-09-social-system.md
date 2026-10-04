# PHASE 09 — Social system

## Сделано

- `modules/friends`: заявки в друзья (`POST /friends/requests/:username`,
  `POST /friends/requests/:id/accept`, `DELETE /friends/requests/:id` —
  работает и как «отклонить входящую», и как «отменить исходящую»), список
  друзей/блокировок/входящих/исходящих, `DELETE /friends/:userId` (удалить
  из друзей), `POST/DELETE /friends/block/:userId`.
  - `friendRequestPolicy` соблюдается полностью: `NOBODY` → 403,
    `FRIENDS_OF_FRIENDS` → проверка реального пересечения множеств друзей.
  - Повторная заявка (в любом направлении), заявка себе, заявка
    заблокированному — явные `409`/`403`, а не падение на unique constraint.
  - Принятие заявки создаёт `Activity` (`FRIENDSHIP_STARTED`, `visibility:
    FRIENDS`) — первый реальный источник записей в ленте активности.
- `modules/comments` (`ProfileComment`): листинг (публичный, пагинация),
  создание (проверяет `commentsEnabled` + `commentPolicy` —
  `EVERYONE`/`NOBODY`/`FRIENDS`/`FRIENDS_OF_FRIENDS`, последние два — через
  `FriendsService`), редактирование/soft-delete только автором, реакции
  (свободный emoji, не `ReactionType`!) с переключением, жалобы
  (`CommentReport`, upsert по `(commentId, reporterId)`).
- `modules/activity`: глобальная лента (`GET /activity/feed`, только
  `PUBLIC`), персональная лента с учётом видимости (`GET
  /activity/feed/user/:username` — `FRIENDS` виден только друзьям, `PRIVATE`
  — только владельцу), `GET /activity/:id`, `GET/PATCH /activity/settings`
  (`ActivityFeedSettings`, upsert), реакции и комментарии к активности
  (`ActivityReaction`/`ActivityComment`, тот же паттерн toggle/soft-delete).
- `src/common/html.util.ts`: `escapeToHtml`/`extractMentions` — безопасный
  рендер `content` → `contentHtml` (экранирование + `<br>`, без интерпретации
  HTML/JS) и парсинг `@username` в `mentions`. Полноценный Markdown +
  `sanitize-html` allowlist (как в 29-SECURITY.md старого проекта) — отдельная
  кросс-модульная задача на будущее (нужна chat/news/reports одинаково),
  сейчас важна только безопасность, не форматирование.

## Реальная ошибка в схеме, пойманная при проектировании (не тестами — заранее)

Изначально реализовал реакции на комментарии через enum `ReactionType`
(`LIKE`/`DISLIKE`), как у `ProfileReaction`. При сверке со схемой выяснилось:
`CommentReaction.emoji` и `ActivityReaction.emoji` — свободная `String`
(Discord-style произвольный emoji), только `ProfileReaction.type` — жёсткий
enum. Это два разных по смыслу поля в исходной схеме (простой like/dislike
на профиле vs произвольные emoji-реакции на комментарии/активность).
Исправлено до коммита — `ReactCommentDto`/`ReactActivityDto` используют
`emoji: string`.

## Проверено реальным запуском

`apps/api/test/social.e2e-spec.ts` — **6 тестов** против реального
Postgres+Redis, все прошли с первого запуска:
- нельзя отправить заявку себе; `NOBODY` блокирует заявку;
- полный цикл заявка → дубликат (409) → `incoming`/`count` → принятие →
  друг появляется в списке → **в БД реально создаётся `Activity`
  FRIENDSHIP_STARTED** → удаление из друзей убирает из списка;
- блокировка запрещает заявку от заблокированного;
- комментарии: создание (с извлечением `@mention`) → список → редактирование
  автором → чужая правка 403 → реакция toggle (ставится/снимается) →
  удаление скрывает из листинга;
- `commentsEnabled=false` → 403 на попытку комментировать;
- глобальная лента отдаёт массив; персональная лента стороннего (не друга)
  зрителя не падает; `activity/settings` создаёт дефолтную запись при первом
  обращении (upsert).

Полный набор из корня (7 e2e suite, 33 теста) + `lint`/`format:check`/
`typecheck`/`build`/`test` — все зелёные.

## Не входит в эту фазу

- Leaderboards — PHASE 19 (Gamification), как и зафиксировано в
  `COVERAGE.md` ещё на PHASE 00.
- Полный Markdown-рендеринг с `sanitize-html` allowlist — отдельная
  кросс-модульная задача, пока достаточно безопасного escape.
- Модерация комментариев/активности (`hard-delete`, `isPinned` модератором,
  рассмотрение `CommentReport`) — PHASE 16.
- Уведомления о упоминаниях/заявках/реакциях (`notifyOn*` флаги уже
  учитываются в профиле, но сама отправка уведомлений не реализована) —
  PHASE 12.
