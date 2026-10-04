# PHASE 08 — Profiles

## Сделано

- `modules/profiles`: `ProfilesService`/`ProfilesController`.
  - `GET /users/:username/public` (опциональная аутентификация через
    `OptionalJwtAuthGuard`) — публичный просмотр профиля с фильтрацией по
    приватности.
  - `GET/PATCH /users/me/profile` — просмотр/редактирование собственного
    профиля (bio, statusText, country, city, gender, birthDate+showBirthDate,
    все `hide*`-флаги, `profileVisibility`/`friendRequestPolicy`/
    `directMessagePolicy`/`commentPolicy`, `notifyOn*`).
  - `GET/PUT/DELETE /users/me/social-links(/:platform)` — соцсети (upsert по
    платформе).
  - `GET /users/me/decorations`, `PATCH /users/me/decoration` — выбор
    декорации только из реально принадлежащих пользователю
    (`UserDecoration`), `null` снимает декорацию.
- **Приватность (фильтрация для чужого просмотра):** `hideEmail/hideCountry/
  hideCity/hideGender/hideBirthDate/hideSocials` скрывают соответствующие
  поля; `birthDate` при `showBirthDate=false` отдаёт только `{month, day}`
  (без года) — две разные степени приватности дня рождения, как и
  предполагают оба поля в исходной схеме. `profileVisibility=NOBODY` или
  `FRIENDS_ONLY` → `404` для всех, кроме владельца (`FRIENDS_ONLY` до
  появления системы друзей, PHASE 09, трактуется как недоступно посторонним
  — безопасный дефолт, не раскрытие).

## Архитектурное решение (не описано заранее в ADR, зафиксировано здесь)

`avatar`/`banner` **не** добавлены как произвольно редактируемые строковые
поля в `UpdateProfileDto` — это прямо запрещено MASTER PROMPT §77 (клиент не
передаёт storage path). Назначение аватара/баннера будет происходить через
upload-эндпоинт PHASE 23 (CDN), который сам формирует ключ после обработки
файла и проставляет поле `User.avatar`/`User.banner` — не напрямую через
`PATCH /users/me/profile`.

## Проверено реальным запуском

`apps/api/test/profiles.e2e-spec.ts` — **5 тестов** против реального
Postgres+Redis, все прошли с первого запуска:
- обновление профиля (bio/country/city) отражается в ответе;
- `hideCountry=true` скрывает `country` в публичном просмотре, но не в
  собственном (`GET /users/me/profile`);
- `profileVisibility=NOBODY` → `404` для анонимного запроса и для чужого
  токена, `200` для владельца;
- социальные ссылки: добавление → видны в публичном профиле → `hideSocials`
  скрывает → удаление;
- декорации: выбор чужой (не принадлежащей) декорации → `403`; выбор своей
  → `200` и реально проставляется `User.selectedDecorationId`; снятие
  (`decorationId: null`) → поле становится `null`.

Полный набор из корня (6 e2e suite, 27 тестов) + `lint`/`format:check`/
`typecheck`/`build`/`test` — все зелёные.

## Не входит в эту фазу

- Avatar/banner upload — PHASE 23 (CDN).
- Badges (`UserBadge`/`displayBadge`) — нечего показывать до PHASE 19
  (Gamification), сами поля в выдаче есть (`displayBadge` в select), но
  управление ими не реализовано.
- Полная проверка `FRIENDS_ONLY` относительно реальной дружбы — PHASE 09.
- Статистика (`hideStatistics`) — флаг хранится, но `PlayerStatistics` ещё не
  имеет публичного API (PHASE 19/leaderboards).
