# PHASE 19 — Gamification

## Сделано

- `modules/achievements/` — `AchievementProgressService` реально
  вычисляет прогресс по 17 из 19 `AchievementConditionType` из текущего
  состояния БД (PlayerStatistics/Friendship/ProfileComment/
  CommentReaction/Order/OrderItem/Report/UserBadge/User) — не моковые
  числа. Пересчёт — только явный, через `POST /admin/achievements/
  check-all-users` (пакетная модель, ADR-0043); DAYS_STREAK/PROFILE_VIEWS
  честно не поддержаны — нет персистентного счётчика в схеме (ADR-0044).
  Достижение при разблокировке реально выдаёт `rewardBadgeType` (создаёт
  `UserBadge`); `rewardRubies` хранится как заявленная награда, но никуда
  не зачисляется — нет кошелька премиум-валюты (ADR-0045, тот же паттерн,
  что и Store ADR-0035).
  Публичный `AchievementsController` (список с учётом прогресса viewer'а,
  секретные достижения скрыты, пока не разблокированы; деталь; stats),
  `AdminAchievementsController` (CRUD + check-all-users),
  `ModerationAchievementsController` (ручная выдача/отзыв — единственный
  способ продвинуть MANUAL/CUSTOM условия), `UserAchievementsController`
  (свои достижения, достижения другого пользователя, витрина-showcase до
  10 достижений, только завершённые).
- `modules/awards/` — простые декоративные награды: публичный список
  активных, admin CRUD (OWNER-only create/edit/delete по
  PERMISSION-MATRIX), выдача/отзыв пользователю с `grantedBy`.
- Бейджи (`UserBadgeType`) — `GET/POST /admin/users/:userId/badges`,
  `DELETE /admin/users/:userId/badges/:type` в существующем
  `UsersController` (PHASE 07). Заявки на бейдж создателя контента
  (`MediaBadgeRequest`/`UserMediaBadge`) — создание/список своих в
  `profiles.controller.ts` (`/users/me/media-request(s)`, естественное
  место для `/users/me/*`), рассмотрение — новый `MediaRequestsController`
  (`/admin/media-requests`, отдельный от `UsersController`, т.к. префикс
  `/admin/media-requests` не вложен в `/admin/users`).
- `modules/leaderboards/` — один публичный эндпоинт, 5 реальных рейтингов
  (playtime/kills/coins из `PlayerStatistics`, achievements — число
  завершённых `UserAchievement`, purchases — число `COMPLETED` заказов) —
  без выдуманных метрик (ADR-0046).
- 15 новых permission-ключей (`achievements.*`, `awards.*`,
  `media_requests.*`, `users.achievements`/`.achievements.grant`/
  `.awards`/`.badges`).

## Проверено реальным запуском

`apps/api/test/gamification.e2e-spec.ts` — **11 тестов** против реального
Postgres+Redis: создание достижений трёх разных типов условий (авто/
секретное/MANUAL) permission-gated; публичный список скрывает секретное
достижение до разблокировки; `check-all-users` реально считает
FRIENDS_COUNT по настоящей записи `Friendship` и разблокирует
достижение (проверено и по API, и напрямую по `unlockedCount` в БД);
витрина — нельзя добавить незавершённое достижение, завершённое
добавляется и снимается; модератор вручную выдаёт секретное достижение
— оно становится видимым в публичном списке; проверено, что
`check-all-users` не продвигает MANUAL-достижение (остаётся без
`UserAchievement`), только ручная выдача модератором; публичная
статистика; awards — CRUD, публичный список активных, выдача/повторная
выдача отклоняется/отзыв; бейджи — выдача/
список/отзыв; media-request — создание пользователем, список pending
админом, одобрение создаёт реальный `UserMediaBadge`; leaderboards —
реальный рейтинг по вручную проставленной `PlayerStatistics`.

Полный набор из корня (22 e2e suite, 178 тестов) + `lint`/`format:check`/
`typecheck`/`build`/`test` — все зелёные.

## Не входит в эту фазу

- Событийный (real-time) пересчёт прогресса при каждом релевантном
  действии — пакетная модель (ADR-0043), совпадает с дизайном исходного
  API (`check-all-users`); периодический автозапуск — PHASE 29.
- DAYS_STREAK/PROFILE_VIEWS — нет персистентного счётчика в схеме
  (ADR-0044).
- Зачисление `rewardRubies` — нет кошелька премиум-валюты (ADR-0045).
- `POST /admin/achievements/upload-icon` — зависит от `StorageService`
  (PHASE 23, RISKS.md R3); поле `iconUrl` принимает готовый URL уже сейчас.
- `/admin/dashboard/*` (StatisticsController) — вопреки изначальной
  пометке в COVERAGE.md "PHASE 19", авторитетный ROADMAP.md относит
  "achievements, awards, badges, leaderboards" к PHASE 19, а общий
  admin-дашборд — к PHASE 20 (Admin backend), где он естественно
  агрегирует данные уже реализованных к тому моменту доменов.
