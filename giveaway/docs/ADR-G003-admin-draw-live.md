# ADR-G003 — админка, розыгрыш, эфир и тестовый режим (розыгрыш, фаза 3)

Статус: принято (допущения помечены «Допущение»). Дата: 2026-11-19. Продолжает ADR-G001 и ADR-G002. Требования: `MASTER-PROMPT-17.3.md`. Отклонения от рекомендаций chief перечислены в разделе 12.

Базовый путь: `/api/giveaway/v1/...` (без `/api` тоже работает, как в ADR-G002). Хосты (допущение): публичная страница `giveaway.twomc.su`, админка и тестовая страница `admin.giveaway.twomc.su`; API доступен на обоих хостах через nginx. Ошибки: `{"error":"<код>"}` без деталей. Время: UTC (ISO 8601) плюс строки «по МСК». Все ответы админки и эфира: `Cache-Control: no-store`.

## 1. Контексты данных: live и test

1.1. Режим выбирается параметром `?mode=live|test` (по умолчанию `live`). `test` доступен только при `GIVEAWAY_TEST_MODE_ENABLED=true` и только с админ-сессией; иначе `404 {"error":"test_mode_disabled"}`.
1.2. Изоляция: реальные таблицы (`giveaway_minutes`, `giveaway_tickets`, `giveaway_players`, `giveaway_codes`, `giveaway_settings`) в тесте НЕ читаются и НЕ пишутся. Тест живёт в отдельных таблицах `giveaway_test_time_grants` и `giveaway_test_tickets`. Итоги (`giveaway_draws`, `giveaway_winners`) общие для режимов, но жёстко разделены колонкой `context` (`live`|`test`, UNIQUE на `context` = один розыгрыш на контекст); каждый запрос итогов фильтрует по контексту. Сброс теста удаляет только строки с `context='test'` и содержимое `giveaway_test_*`.
1.3. Призы (`giveaway_prizes`) - единый список; тест читает его только на чтение (копирует в снимок призов теста). Если призов нет, тест использует встроенные демо-призы («Тестовый приз» x3). Призы живого розыгрыша тестом не меняются.
1.4. Настройки (порог, даты) в тесте берутся из живых настроек только на чтение; в тесте ограничения по датам не применяются (заморозка допустима до отсечки).
1.5. Ручное начисление времени существует ТОЛЬКО в тесте: эндпоинты `POST /admin/test/*` пишут лишь в `giveaway_test_*`; сервисный метод с режимом `live` выбрасывает `manual_time_disabled_in_live`; живой подсчёт идёт исключительно по `giveaway_minutes` из приёмника событий (ADR-G001). Это доказано тестами.
1.6. Тестовый UUID игрока: `00000000-0000-4000-8000-` + первые 12 hex от SHA-256 ника (в нижнем регистре). Билеты теста того же формата (буква + 3 цифры).

## 2. Админ-вход Discord OAuth2

2.1. Конфиг (env, не в репозитории): `GIVEAWAY_DISCORD_CLIENT_ID`, `GIVEAWAY_DISCORD_CLIENT_SECRET`, `GIVEAWAY_DISCORD_REDIRECT_URI` (`https://admin.giveaway.twomc.su/api/giveaway/v1/admin/auth/callback`), `GIVEAWAY_ADMIN_DISCORD_IDS` (ровно ID через запятую, только цифры), `GIVEAWAY_ADMIN_ORIGIN` (по умолчанию `https://admin.giveaway.twomc.su`). Пустой allowlist, нет client id/secret/redirect или слабый мастер-секрет: вход закрыт (`403 {"error":"admin_login_closed"}`), fail closed.
2.2. `GET /admin/auth/login`: генерирует `state` (32 байта CSPRNG, base64url), `code_verifier` PKCE (32 байта, base64url), `code_challenge = BASE64URL(SHA-256(verifier))` (S256) и binder (32 байта). В Redis `giveaway:oauth:<sha256(state)>` хранится `{verifier, binderHash}` с TTL 600 с. Binder кладётся в cookie `gw_admin_oauth` (`HttpOnly; Secure; SameSite=Lax; Path=/api/giveaway/v1/admin/auth; Max-Age=600`; Lax нужен, потому что возврат от Discord - навигация с другого сайта) и защищает от login CSRF. Ответ `302` на `https://discord.com/oauth2/authorize` с `response_type=code`, `client_id`, `redirect_uri`, `scope=identify`, `state`, `code_challenge`, `code_challenge_method=S256`. Лимит: 20 входов за 10 минут на адрес (`429`).
2.3. `GET /admin/auth/callback?code&state`: state удаляется из Redis атомарно при первом чтении (одноразовость); нет state, он просрочен или binder не совпал: отказ. Далее обмен кода на токен (`POST https://discord.com/api/v10/oauth2/token`, форма: `grant_type=authorization_code`, `code`, `redirect_uri`, `code_verifier`, `client_id`, `client_secret`), затем `GET /users/@me` с Bearer-токеном. Таймаут запросов 8 с, встроенный `fetch`. Проверки: `id` в allowlist (иначе `not_allowed`), `mfa_enabled === true` (иначе `mfa_required`; допущение: замена правила 2FA админов Q22 - у Discord-аккаунта должна быть включена 2FA). Токен Discord после проверки отзывается (`POST /oauth2/token/revoke`, best effort) и нигде не сохраняется.
2.4. Итог callback всегда `302` на `${GIVEAWAY_ADMIN_ORIGIN}/`: при успехе без параметров и с cookie сессии; при отказе `/?error=<login_failed|not_allowed|mfa_required|state_invalid|login_closed>`. Cookie `gw_admin_oauth` очищается. Первая загрузка страницы после редиректа считается межсайтовой (SameSite=Strict её cookie не получит) - страница обязана затем вызвать `GET /admin/session`.
2.5. Сессия: токен 32 байта CSPRNG (base64url, 43 символа), в БД `giveaway_admin_sessions.tokenHash = HMAC-SHA256(K_admin_session, токен)` (ключ HKDF из мастер-секрета, метка `admin-session`). Cookie `gw_admin`: `HttpOnly; Secure; SameSite=Strict; Path=/api/giveaway/v1; Max-Age=28800`, без `Domain` (host-only, только админ-хост). Idle 30 минут (`lastSeenAt` обновляется на каждом запросе), абсолютный срок 8 часов (`expiresAt`). Каждый запрос заново проверяет allowlist (удаление ID из env отзывает доступ немедленно). Выход: `POST /admin/auth/logout` отзывает сессию (`revokedAt`) и очищает cookie.
2.6. CSRF для всех запросов кроме GET/HEAD (на админском API): (а) заголовок `Origin` обязателен и должен точно совпасть с `GIVEAWAY_ADMIN_ORIGIN`, (б) заголовок `X-Giveaway-Csrf` = `csrfToken` из `GET /admin/session` (`HMAC-SHA256(K_admin_csrf, токен сессии)` hex), сравнение за постоянное время. Иначе `403 {"error":"csrf"}` (и запись в аудит). Тело изменяющих запросов - JSON (`Content-Type: application/json`) или пустое.
2.7. Права: все три администратора равны (допущение). Создавать новые розыгрыши через API нельзя: единственный розыгрыш определяется настройками и контекстами `live`/`test`.
2.8. Лимиты: админ-API 300 запросов/мин на адрес. Логи не содержат токенов, кодов OAuth, секретов и IP.

## 3. Алгоритм розыгрыша

3.1. Снимок: упорядоченный список билетов (по возрастанию значения билета, сравнение кодовых единиц), каждый `{ticket, playerUuid, playerName}`. Канонический JSON (без пробелов, порядок ключей зафиксирован):
`{"schema":"twomc.giveaway.snapshot.v1","tickets":[{"ticket":"A001","playerUuid":"...","playerName":"..."},...]}`.
`snapshotHash = SHA-256(UTF-8 байты канонического JSON)`, hex в нижнем регистре. Снимок и хэш сохраняются в `giveaway_draws` при заморозке и не меняются.
3.2. Зерно: `seed` = 32 байта CSPRNG, создаётся только на «Рассчитать» (после публикации хэша). Хранится hex (64 символа).
3.3. Поток случайных слов: `block(c) = HMAC-SHA256(key = seed, message = ASCII(snapshotHash) (64 байта) || u32be(c))`, `c = 0, 1, 2, ...`. Блок (32 байта) даёт 8 слов по 4 байта big-endian, слова берутся подряд.
3.4. Равномерное целое в `[0, n)`: `limit = 2^32 - (2^32 mod n)`; берётся следующее слово `x`; если `x >= limit`, оно отбрасывается и берётся следующее; результат `x mod n`.
3.5. Перестановка: массив индексов `a = [0..N-1]` по отсортированному снимку; для `i = N-1` вниз до `1`: `j = below(i+1)`, поменять `a[i]` и `a[j]`. `order[k]` - билет с индексом `a[k]`.
3.6. Места: призы в порядке приоритета (`priority` по возрастанию, при равенстве - по времени создания, затем id); приз с количеством `q` даёт `q` мест подряд. Места нумеруются с 1. Победитель места `p` - `order[p-1]`. Если мест больше, чем билетов, лишние места остаются пустыми.
3.7. Дисквалификация и замена: победитель отмечается `disqualified` (причина, аудит). Место получает первый билет в `order`, индекс которого ещё не использован ни одной записью победителя этого розыгрыша (ни действующей, ни дисквалифицированной). Если билетов больше нет, место остаётся пустым (`replacement: null`). Уникальность `(drawId, orderIndex)` в БД исключает повторное использование и гонки.
3.8. Публикуются: `snapshotHash` (с момента заморозки), а после «Показать в эфире» - `seed`, `algorithm`, `order`. Допущение: канонический снимок содержит UUID игроков и публично не отдаётся (публично только ник и билет). Проверка независимым лицом: отсортировать опубликованные билеты, посчитать перестановку по `seed` и `snapshotHash` (п. 3.3-3.5) и сравнить с `order`; полную проверку `snapshotHash` по снимку организатор делает по запросу.
3.9. Ограничение: организатор мог бы перебирать зёрна до «удобного» результата; смягчение - внешний наблюдатель видит хэш снимка заранее, а результат до эфира виден только админам. Фиксация зерна заранее (commit) отклонена, потому что по требованию зерно создаётся именно на «Рассчитать».

### Тестовый вектор

Алгоритм: `twomc-giveaway-draw-v1`. Вход: 10 билетов (в порядке задания): `K417 Alex`, `A001 Bob_1`, `M250 Cat`, `Z999 Dave`, `B002 Eve`, `C333 Finn`, `P777 Gus`, `T100 Hana`, `H808 Ivy`, `W640 Jack`, с UUID `00000000-0000-4000-8000-0000000000NN` (`NN` - порядковый номер 01..10 в порядке задания: Alex=01, Bob_1=02, ..., Jack=10).

Канонический JSON (одна строка, без перевода строки):

```
{"schema":"twomc.giveaway.snapshot.v1","tickets":[{"ticket":"A001","playerUuid":"00000000-0000-4000-8000-000000000002","playerName":"Bob_1"},{"ticket":"B002","playerUuid":"00000000-0000-4000-8000-000000000005","playerName":"Eve"},{"ticket":"C333","playerUuid":"00000000-0000-4000-8000-000000000006","playerName":"Finn"},{"ticket":"H808","playerUuid":"00000000-0000-4000-8000-000000000009","playerName":"Ivy"},{"ticket":"K417","playerUuid":"00000000-0000-4000-8000-000000000001","playerName":"Alex"},{"ticket":"M250","playerUuid":"00000000-0000-4000-8000-000000000003","playerName":"Cat"},{"ticket":"P777","playerUuid":"00000000-0000-4000-8000-000000000007","playerName":"Gus"},{"ticket":"T100","playerUuid":"00000000-0000-4000-8000-000000000008","playerName":"Hana"},{"ticket":"W640","playerUuid":"00000000-0000-4000-8000-000000000010","playerName":"Jack"},{"ticket":"Z999","playerUuid":"00000000-0000-4000-8000-000000000004","playerName":"Dave"}]}
```

- `snapshotHash` = `0436be4eeadab96d00085c89cc04a3bfb2880edbb38e1ba5d9ca444fb8ce1996`
- `seed` (hex) = `000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f`
- `block(0)` = `45414e46bb577f507ed9438a1ba4b8f4a0f937195c0f1d9ddb786834955d1251`; первые слова: `1161907782`, `3143073616`, `2128167818`.
- Перестановка индексов (по отсортированному снимку A001=0 ... Z999=9): `[4,1,8,0,6,3,5,9,7,2]`.
- `order` = `K417, B002, W640, A001, P777, H808, M250, Z999, T100, C333`.
- Призы по приоритету: «Клавиатура» x2, «Микрофон» x1: места 1-2 (клавиатура): K417, B002; место 3 (микрофон): W640.
- Дисквалификация K417: место 1 получает `A001` (индекс 3 в `order`, первый неиспользованный). Затем дисквалификация B002: место 2 получает `P777`.

Тест `giveaway-draw.spec.ts` проверяет эти числа.

## 4. Статусы розыгрыша и переходы

`none -> frozen -> calculated -> broadcast`; обратных переходов нет (кроме сброса теста). Каждый переход - условный `UPDATE ... WHERE id=? AND status=<предыдущий>` в транзакции, `revision` увеличивается на 1 при любом изменении состояния (включая дисквалификацию). «Рассчитать» ровно один раз: `status` меняется с `frozen` на `calculated` условным обновлением (0 строк - `409 already_calculated`), контекст уникален (`UNIQUE(context)`). Заморозка идемпотентна (повтор возвращает существующий снимок).

## 5. Админ-API (все требуют админ-сессию; изменяющие - Origin и CSRF)

Все пути с префиксом `/api/giveaway/v1`.

5.1. `GET /admin/session` -> `{"discordId":"...","discordName":"...","csrfToken":"<hex>","expiresAt":"...","idleTimeoutS":1800,"testModeEnabled":true}`; без сессии `401 {"error":"unauthorized"}`.
5.2. `GET /admin/tickets?mode&q&page&pageSize` (`q` - часть ника или билета, до 32 символов; `pageSize` 1..100, по умолчанию 25) -> `{"items":[{"ticket","playerName","playerUuid","issuedAt"}],"page","pageSize","total"}`.
5.3. `GET /admin/players/:uuid?mode` -> `{"playerUuid","playerName":string|null,"ticket":string|null,"totalMinutes","thresholdMinutes","days":[{"day":"2026-11-22","minutes":N}],"test":false}`; `days` - по датам МСК (`YYYY-MM-DD`), только минуты с разрешённых серверов в окне `[startAt, cutoffAt]`.
5.4. `GET /admin/settings` -> `{"thresholdMinutes","startAtUtc","cutoffAtUtc","startAtMsk","cutoffAtMsk","started":bool,"drawFrozen":bool}`. `PATCH /admin/settings` тело `{"thresholdMinutes"?,"startAt"?,"cutoffAt"?}` (ISO UTC, хотя бы одно поле, лишние поля отклоняются). Правила: после старта порог только вниз, старт не меняется (сервис настроек); дату отсечки нельзя переносить в прошлое после старта (`cutoff_in_past`); после заморозки настройки не меняются (`409 draw_frozen`). Ошибки правил: `400 {"error":"threshold_cannot_increase_after_start"|"start_cannot_change_after_start"|"window_invalid"|...}`.
5.5. Призы: `GET /admin/prize-images` -> `{"items":["keyboard.png"]}` (файлы каталога `giveaway/prizes/`, имя `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.png$`; каталог задаёт `GIVEAWAY_PRIZES_DIR`). `GET /admin/prizes` -> `{"items":[{"id","name","quantity","imageFile":string|null,"priority"}],"locked":bool}`. `POST /admin/prizes` `{"name":1..80,"quantity":1..100,"imageFile"?:string|null,"priority"?:int}`; `PATCH /admin/prizes/:id` (любое подмножество полей); `DELETE /admin/prizes/:id`. `imageFile` проверяется по текущему списку файлов (имя не используется как путь): иначе `400 invalid_image`. После расчёта живого розыгрыша призы заблокированы (`409 draw_locked`). Загрузки файлов нет.
5.6. `GET /admin/draw?mode` -> состояние (раздел 6.1).
5.7. `POST /admin/draw/freeze?mode` -> состояние. Live: только после `cutoffAt` (`409 cutoff_not_reached`), нужен хотя бы один билет (`409 no_tickets`).
5.8. `POST /admin/draw/calculate?mode` тело `{"snapshotHash":"<64 hex>","confirm":"РАССЧИТАТЬ"}` -> состояние. Ошибки: `400 invalid_body`, `409 not_frozen`, `409 snapshot_mismatch`, `409 already_calculated`, `409 no_prizes` (нет призов; для теста - используются демо-призы). Необратимо.
5.9. `POST /admin/draw/broadcast?mode` (тело `{}`) -> состояние; `409 not_calculated`, `409 already_broadcast`. Публикует событие эфира (раздел 8).
5.10. `POST /admin/draw/winners/:id/disqualify?mode` тело `{"reason":"3..300 символов"}` -> `{"replacement":WinnerAdmin|null,"draw":состояние}`; `409 winner_not_active`, `404 not_found`. Допустимо до и после эфира; после эфира увеличивает `revision` и рассылает событие.
5.11. Тест (только `GIVEAWAY_TEST_MODE_ENABLED`, иначе `404 test_mode_disabled`): `POST /admin/test/time` `{"playerName":"^[A-Za-z0-9_]{1,16}$","minutes":1..100000,"day"?:"YYYY-MM-DD"}` -> `{"playerName","totalMinutes"}` (суммарно не более 1 000 000 минут на ник); `POST /admin/test/tickets` `{"playerName"}` -> `{"ticket","playerName","totalMinutes"}` (`409 not_enough_time`, если минут меньше порога; повтор возвращает тот же билет); `POST /admin/test/seed` `{"count":1..500}` -> `{"created":N}` (создаёт ники `TestNNN` с порогом минут и билетами); `POST /admin/test/reset` -> `{"reset":true}` (удаляет только тестовые данные и тестовый розыгрыш; рассылает событие `reset` в тестовый канал).
5.12. `GET /admin/audit?page&pageSize` -> `{"items":[{"id","at","actor","action","objectType","objectId","mode","detail"}],"page","pageSize","total"}`.

## 6. Схемы состояния и итогов

6.1. Состояние для админа (`GET /admin/draw`):
```json
{"mode":"live","test":false,"status":"none|frozen|calculated|broadcast","canFreeze":true,
 "snapshotHash":"<hex>|null","ticketCount":123,"frozenAt":"...","algorithm":"twomc-giveaway-draw-v1",
 "seed":"<hex>|null","calculatedAt":"...|null","broadcastAt":"...|null","revision":1,
 "order":[{"ticket":"K417","playerName":"Alex"}],
 "prizes":[{"name":"Клавиатура","quantity":2,"imageFile":"keyboard.png"}],
 "winners":[{"id":"...","place":1,"orderIndex":0,"ticket":"K417","playerName":"Alex","playerUuid":"...",
   "prizeName":"Клавиатура","imageFile":"keyboard.png","status":"active|disqualified",
   "disqualifyReason":null,"replacesWinnerId":null,"totalMinutes":3100}]}
```
`order`, `seed`, `winners` присутствуют после «Рассчитать» (предпросмотр). Профиль по дням - `GET /admin/players/:uuid`.
6.2. Публичные итоги (`GET /public/results?mode=live`, без сессии; `Cache-Control: no-store`; лимит 120/мин на адрес): до эфира (нет розыгрыша, заморожен или рассчитан - не различаются):
`{"test":false,"state":"idle|frozen","snapshotHash":"<hex>|null","ticketCount":N|null,"revision":N}`;
после эфира:
```json
{"test":false,"state":"results","snapshotHash":"<hex>","ticketCount":123,"revision":4,
 "algorithm":"twomc-giveaway-draw-v1","seed":"<hex>","broadcastAt":"...",
 "order":[{"ticket":"K417","playerName":"Alex"}],
 "winners":[{"place":1,"ticket":"A001","playerName":"Bob_1","prizeName":"Клавиатура","imageFile":"keyboard.png"}],
 "disqualified":[{"place":1,"ticket":"K417","playerName":"Alex","prizeName":"Клавиатура"}]}
```
`winners` - только действующие, по возрастанию места; `disqualified` - дисквалифицированные (без причины). Публично нет UUID, причин и данных админов. `mode=test` требует админ-сессию (cookie `gw_admin`; иначе `401`), в ответе `"test":true`, формат тот же.

## 7. Аудит

Таблица `giveaway_admin_audit`: время, Discord ID администратора, действие, тип и id объекта, режим, краткая подробность (поля без секретов: названия изменённых полей, билеты, причина дисквалификации). Пишется на вход, выход, отказ входа (причина, Discord ID из ответа Discord, если уже получен), отказ CSRF и на каждое изменение (настройки, призы, заморозка, расчёт, эфир, дисквалификация, тестовые операции, сброс теста). Токены, коды OAuth, секреты и IP не записываются.

## 8. Эфир

8.1. `GET /stream?mode=live|test` (публичный для `live`; `test` - только с админ-сессией, иначе `401`). Заголовки: `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-store, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`. Сразу отправляется `retry: 5000` и событие `ready`. Heartbeat: комментарий `: hb` каждые 15 с. Ограничение: не более 6 одновременных соединений на адрес (на инстанс), иначе `429`; лимит открытий 60 в минуту на адрес.
8.2. События (`event: <имя>`, `data: <JSON>`): `ready` `{"revision":N}`; `results` `{"revision":N,"state":"results"}` - эфир включён или итоги изменились (дисквалификация после эфира); `reset` `{}` - только тестовый канал. Событие - лишь сигнал: страница обязана заново запросить `GET /public/results` и отрисовать итоги. Потерянное соединение EventSource восстанавливает сам; при отсутствии SSE страница опрашивает `GET /public/results` раз в 5 с и сравнивает `revision`.
8.3. Несколько инстансов: публикация в Redis-канал `giveaway:stream`; каждый инстанс подписан (лениво, при первом соединении) и рассылает своим клиентам. Если Redis недоступен, публикация делает локальную рассылку (деградация без потери для клиентов этого инстанса).
8.4. Тестовый эфир: события канала `test` получают только соединения с админ-сессией; публичные соединения (`mode=live`) их не видят.

## 9. Тестовый режим и метка «ТЕСТ» (контракт для web)

9.1. Тестовая страница - на админ-хосте, только для админ-сессии (cookie `gw_admin` на этом хосте), запрашивает `mode=test`. В любом ответе тестового режима `"test": true`; страница обязана показывать постоянную заметную метку «ТЕСТ» (не скрываемую), в том числе в итогах и анимации.
9.2. Реальная публичная страница `giveaway.twomc.su` всегда `mode=live` и никогда не видит данных теста.

## 10. Разделы для web

10.1. Публичная страница (`giveaway.twomc.su`): раздел 6.2 (`GET /public/results`), раздел 8 (SSE + опрос). Режим итогов включается, когда `state === "results"`; по очереди показываются `winners` (по `place`), картинка приза - статический файл `/giveaway/prizes/<imageFile>` (путь настраивается nginx; если `imageFile` равен `null`, показывается заглушка); блок «Проверка»: `snapshotHash`, `seed`, `algorithm`, `order`; список `disqualified` отдельно. Анимации с учётом `prefers-reduced-motion`.
10.2. Админка (`admin.giveaway.twomc.su`): вход - переход браузера на `/api/giveaway/v1/admin/auth/login`; далее `GET /admin/session` (получить `csrfToken`); все изменяющие запросы: `credentials: "same-origin"`, заголовки `Content-Type: application/json` и `X-Giveaway-Csrf`; разделы: билеты (5.2), игрок (5.3), настройки (5.4), призы (5.5), розыгрыш (5.6-5.10, кнопки по `status`; для «Рассчитать» ввод фразы `РАССЧИТАТЬ` и подтверждение `snapshotHash`), тест (5.11, только если `testModeEnabled`), аудит (5.12). На 401 - переход на вход.
10.3. Тестовая страница: те же компоненты, что и публичная, но с `mode=test`, меткой «ТЕСТ» (раздел 9) и SSE-каналом `test`.

## 11. Миграция и конфигурация

Миграция `20261119170000_giveaway_phase3` (SQL вручную, expand-only, не применять без ревью владельца): новые таблицы `giveaway_prizes`, `giveaway_draws`, `giveaway_winners`, `giveaway_admin_sessions`, `giveaway_admin_audit`, `giveaway_test_time_grants`, `giveaway_test_tickets`; единственный внешний ключ - `giveaway_winners.drawId -> giveaway_draws.id ON DELETE CASCADE` (между новыми таблицами, нужен для сброса теста). Существующие таблицы и колонки не затрагиваются. Новые env: `GIVEAWAY_DISCORD_CLIENT_ID`, `GIVEAWAY_DISCORD_CLIENT_SECRET`, `GIVEAWAY_DISCORD_REDIRECT_URI`, `GIVEAWAY_ADMIN_DISCORD_IDS`, `GIVEAWAY_ADMIN_ORIGIN`, `GIVEAWAY_TEST_MODE_ENABLED` (по умолчанию false), `GIVEAWAY_PRIZES_DIR`. Режим `GIVEAWAY_ONLY`: новые контроллеры входят в `GiveawayModule`, отдельного подключения не требуется.

## 12. Отклонения от рекомендаций и допущения

- Binder-cookie `gw_admin_oauth` сверх рекомендации (защита от login CSRF, state привязан к браузеру).
- Двойная защита CSRF (Origin + заголовок), потому что Origin может отсутствовать у некоторых клиентов; изменяющие запросы без Origin отклоняются.
- Ограничение соединений SSE на адрес - на инстанс (в памяти), а не общее через Redis: проще и без риска зависших счётчиков; общий лимит дублируется nginx.
- Канонический снимок содержит UUID и не публикуется (п. 3.8), публично - ник и билет.
- Тест читает призы живого списка на чтение (п. 1.3), а не хранит копию.
- Допущения для вопросов владельцу: MFA Discord вместо 2FA сайта; три админа равны; хост `admin.giveaway.twomc.su`; тест использует живые порог и призы; публикация UUID в снимке не делается.
