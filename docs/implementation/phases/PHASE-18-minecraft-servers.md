# PHASE 18 — Minecraft servers

## Сделано

- `modules/minecraft/slp/` — реальный клиент Server List Ping (wiki.vg/
  Server_List_Ping): `varint.ts` (кодирование/декодирование VarInt и
  VarInt-строк — чистые функции), `slp-client.ts` (`pingServer(host,
  port)`: TCP-соединение → handshake → status request → разбор JSON-ответа
  (игроки/версия/motd) → ping/pong для измерения задержки). Без внешней
  зависимости и без credentials — SLP открытый неаутентифицированный
  протокол (ADR-0040). Недоступность сервера (таймаут/отказ соединения/
  невалидный ответ) — валидный результат `{online: false}`, не исключение.
- `MinecraftStatusService` — оборачивает `pingServer()`: пишет
  `ServerStatusLog` на каждый вызов (без фонового job/кеша — cron ещё нет,
  PHASE 29, ADR-0041), отдаёт снимок статуса.
- `ServerCategoriesController`/`AdminServerCategoriesController` — дерева
  нет (плоский список с `order`), нельзя удалить категорию с серверами.
- `ServersController` (публичный `/servers/*`): список активных,
  `overview` (реальный параллельный опрос всех активных серверов —
  totalServers/onlineServers/totalPlayers), `widget` (HTML-фрагмент для
  встраивания, один сервер по `?slug=` или все), деталь по slug, `status`
  (живой опрос + лог), `players` (реальный sample-список с сервера),
  `history` (последние записи `ServerStatusLog`).
- `AdminServersController` — CRUD сервера, `logs` (пагинированная история
  статуса).
- 9 новых permission-ключей (`server_categories.*`, `servers.*`).
- Попутно: `FormsService.buildAnswerData()` (PHASE 15) получил реальную
  referential-проверку `SERVER_SELECTOR` (`Server.isActive`) теперь, когда
  модель `Server` появилась — обновлён ADR-0027, добавлен кейс в
  `forms.e2e-spec.ts` (без изменения числа e2e-наборов).

## Проверено реальным запуском

`apps/api/test/minecraft.e2e-spec.ts` — **10 тестов** против реального
Postgres+Redis **и** настоящего TCP-сервера в тесте, говорящего реальным
SLP-протоколом (VarInt-кодирование продублировано независимо в тесте —
проверяется wire-формат, а не совпадение с собственной реализацией):
категории — permission-gated создание, публичный список; серверы —
создание (один указывает на фейковый MC-сервер, другой — на заведомо
закрытый порт), публичный список/деталь; статус реально пингует фейковый
сервер и возвращает верные playerCount/maxPlayers/version/ping, пишет
`ServerStatusLog` (включая реальный sample игроков); недоступный сервер
даёт `online: false` без ошибки; `players` отдаёт реальный список имён;
`history` отражает записанный лог; `overview` агрегирует online+offline
реальным параллельным опросом; `widget` возвращает HTML с данными
сервера; admin — пагинированная история/обновление/удаление сервера;
нельзя удалить категорию с сервером.

Полный набор из корня (21 e2e suite, 167 тестов) + `lint`/`format:check`/
`typecheck`/`build`/`test` — все зелёные.

## Не входит в эту фазу

- RCON (выполнение игровых команд, в т.ч. доставка `Product.gameCommands`
  из Store, ADR-0039) — модель `Server` не имеет поля для RCON-пароля;
  это не отложено технически, а не предусмотрено текущей схемой данных
  (ADR-0041). Добавление потребовало бы миграции и отдельного ADR о
  хранении секрета.
- Фоновый периодический опрос (cron) вместо опроса на каждый запрос —
  зависит от background-job инфраструктуры (PHASE 29).
- Запись в `AuditLog` на admin-действия — сквозной механизм для всего
  проекта, ещё не реализован нигде (PHASE 22, ADR-0042), не добавляется
  точечно только здесь.
- Загрузка `Server.iconUrl`/`ServerCategory.icon` — зависит от
  `StorageService` (PHASE 23); поля принимают готовые URL уже сейчас.
