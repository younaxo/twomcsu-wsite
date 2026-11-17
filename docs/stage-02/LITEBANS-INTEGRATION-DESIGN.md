# Этап 02: наказания в реальном времени. Дизайн интеграции с LiteBans

Статус: проект, решения владельца по Q31 приняты (ADR-0166, Accepted-by-owner, реализация по очереди работ). Дата: 2026-11-17. Только документ: код, миграции, зависимости и Docker не затрагивались. Установка `mysql2` и работа с lockfile выполняются отдельной задачей P3-06a после освобождения диска (Q29). Юридическую оценку 152-ФЗ владелец ведёт отдельно, реализацию она не блокирует.

Решения владельца (Q29, Q31, ответ 2026-11-17): источник наказаний — LiteBans (промпт 04, раздел 9); движок БД MySQL, драйвер `mysql2`; пользователя БД с правом SELECT только на таблицы `litebans_*` создаёт владелец сам (пароль агенту не передаётся); сетевой доступ и TLS настраивает владелец по `docs/runbooks/litebans-db-access.md`; миграции зеркальных таблиц создаются по Q28 (только на одноразовой локальной БД, на production применяет владелец). Версия плагина LiteBans и префикс таблиц остаются на сверку (1.4).

## 1. Схема LiteBans и источники

### 1.1 Источники (обращение 2026-11-17, только чтение)

| Источник                                                                                              | Что взято                                                                                                  |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| https://gitlab.com/ruany/LiteBansAPI/-/wikis/Database-Structure                                       | Таблицы, типы, ключи, примечания к столбцам. Структура снята с версии 2.11.1 (дата на странице 2023-01-23) |
| https://gitlab.com/ruany/LiteBansAPI/-/wikis/FAQ                                                      | Поведение столбца `active`, отсутствие событий об истечении, типы записей                                  |
| https://gitlab.com/ruany/LiteBansAPI/-/wikis/Home, файлы `Entry.java` и `Events.java` репозитория API | Java API: `Events.Listener.entryAdded(Entry)`, `entryRemoved(Entry)`; поля `Entry`                         |
| https://gitlab.com/ruany/LiteBans/-/wikis/Punishment-IDs                                              | Обычные и случайные ID; команды `--delete` (удаление строки), `--modify` (изменение)                       |
| https://gitlab.com/ruany/LiteBans/-/wikis/Server-Scopes                                               | Серверные области: `*`, имя сервера, `__ALL__`                                                             |
| https://gitlab.com/ruany/LiteBans/-/wikis/Timezones                                                   | Внутреннее время UTC+0, NTP, `use_database_time`                                                           |
| https://gitlab.com/ruany/LiteBans/-/wikis/Importing                                                   | Драйверы H2 и MySQL/MariaDB, конвертация между ними                                                        |
| https://gitlab.com/ruany/LiteBans/-/wikis/Advanced-Configuration                                      | Расширение `litebans_history.name`, переменная `LITEBANS_CONFIG`                                           |
| https://gitlab.com/ruany/LiteBans/-/wikis/Comparisons                                                 | «Supported Databases: MySQL/MariaDB/PostgreSQL/H2»                                                         |
| https://gitlab.com/ruany/LiteBans/-/wikis/FAQ                                                         | Список драйверов в конфиге, включая `pgsql`                                                                |

Страницы получены через публичный GitLab API wiki (чтение). Название проекта и данные владельца наружу не передавались.

### 1.2 Подтверждено документацией (MariaDB, версия 2.11.1)

Общее: префикс таблиц по умолчанию `litebans_`; кодировка utf8mb4, collation `utf8mb4_unicode_ci`; InnoDB; во всех таблицах `id` типа `SERIAL` (`BIGINT UNSIGNED`, PK, AUTO_INCREMENT).

Таблицы `litebans_bans`, `litebans_mutes`, `litebans_warnings` (одинаковые столбцы; у `warnings` добавлен `warned`):

| Столбец                          | Тип                       | NULL | Примечание из документации                                                              |
| -------------------------------- | ------------------------- | ---- | --------------------------------------------------------------------------------------- |
| id                               | bigint unsigned           | нет  | PK                                                                                      |
| uuid                             | varchar(36)               | да   | UUID с дефисами; значение, начинающееся с `#`, означает «пусто»; индекс                 |
| ip                               | varchar(45)               | да   | шаблон вида `127.0.0.%`, имеет смысл при `ipban`; индекс                                |
| reason                           | varchar(2048)             | да   | произвольная строка с цветовыми кодами, hex-цветами и переводами строк                  |
| banned_by_uuid, banned_by_name   | varchar(36), varchar(128) | да   | выдавший; имя может быть display name с цветами; консоль в примере: `CONSOLE`/`Console` |
| removed_by_uuid, removed_by_name | varchar(36), varchar(128) | да   | снявший; NULL означает «вероятно, не снято» (комментарий в `Entry.java`)                |
| removed_by_reason                | varchar(2048)             | да   | причина снятия                                                                          |
| removed_by_date                  | timestamp                 | нет  | по умолчанию `current_timestamp()`, поэтому НЕ маркер снятия                            |
| time                             | bigint                    | нет  | начало, мс Unix UTC; индекс                                                             |
| until                            | bigint                    | нет  | конец, мс Unix UTC; `<= 0` — бессрочно (в примере `-1`); индекс                         |
| template                         | tinyint unsigned          | нет  | номер шаблона из `templates.yml`; 255 = не задан                                        |
| server_scope                     | varchar(32)               | да   | область действия; `*` — глобально                                                       |
| server_origin                    | varchar(32)               | да   | сервер, где выдано                                                                      |
| silent                           | bit(1)                    | нет  | тихое наказание                                                                         |
| ipban, ipban_wildcard            | bit(1)                    | нет  | IP-бан и шаблон                                                                         |
| active                           | bit(1)                    | нет  | см. 1.3                                                                                 |
| warned (только warnings)         | bit(1)                    | нет  | смысл в документации не описан: требует сверки                                          |

`litebans_kicks`: `id, uuid, ip, reason, banned_by_uuid, banned_by_name, time, until, template, server_scope, server_origin, silent, ipban, ipban_wildcard, active` (без блока `removed_by_*`).

`litebans_history` (журнал ник/UUID/IP): `id, date (timestamp), name varchar(16) NOT NULL, uuid varchar(36), ip varchar(45)`. Длину ника можно расширить командой ALTER (Advanced-Configuration).

`litebans_servers`: `id, name varchar(32), uuid varchar(32) UNIQUE, date timestamp`.

`litebans_allow`: `id, uuid binary(16), type tinyint unsigned`. Назначение в документации не описано: сайт эту таблицу НЕ читает.

### 1.3 Критичные свойства, подтверждённые документацией

1. `active` для истёкших наказаний обновляется пачками не чаще одного раза в ~20 часов одним экземпляром LiteBans. Истечение определяется выражением `active = 1 AND (until < 1 OR until > <сейчас, мс>)`. Значит, `active` нельзя использовать как статус.
2. Событий об истечении в плагине нет по замыслу (FAQ). Сайт сам считает истечение по `until`.
3. `time` и `until` хранятся в мс по UTC. Часовой пояс отображения на значения не влияет.
4. Все строковые столбцы считать nullable; значения, начинающиеся с `#`, считать пустыми.
5. Типа «unban» нет: снятие — это изменение строки `ban` или `mute` (событие `entryRemoved`).
6. Команды `/unban --delete`, `/ban --modify`, `/prunehistory`, `/litebans reset-database` меняют или удаляют строки задним числом: водяной знак по `id` их не увидит.

### 1.4 Требует сверки по реальной БД

Документация снята с версии 2.11.1 (2023). Установленная версия может отличаться (в Install перечислены более новые версии Minecraft, вплоть до `26.x`).

- Фактические столбцы и типы боевой БД, новые столбцы, поведение `warned`, значение `template`, формат консольных записей, заполнение `removed_by_*` при снятии и при истечении.
- Типы столбцов в PostgreSQL (в документации приведена только MariaDB): `bit(1)` может быть `boolean`, `bit` или `smallint`; регистр имён; схема (`public`).
- Тип UUID: при `online_mode: false` LiteBans хранит оффлайн-UUID, а `MinecraftAccount.uuid` сайта приходит от плагина привязки. Совпадение проверить на реальной паре.
- Индексы на боевой БД (в документации MUL по `uuid`, `ip`, `time`, `until`, `template`, `active`, `ipban`; по `removed_by_date` индекса нет).

Способ сверки (делает владелец; без данных строк, пароли не нужны):

```sql
-- MySQL / MariaDB
SELECT VERSION();
SHOW TABLES LIKE 'litebans%';
SHOW CREATE TABLE litebans_bans;
SHOW CREATE TABLE litebans_mutes;
SHOW CREATE TABLE litebans_warnings;
SHOW CREATE TABLE litebans_kicks;
SHOW CREATE TABLE litebans_history;
SELECT COUNT(*), MAX(id) FROM litebans_bans;
```

```sql
-- PostgreSQL
SELECT version();
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name LIKE 'litebans%' ORDER BY table_name, ordinal_position;
```

Плюс в консоли игры `/litebans info` (драйвер и версия). Вывод прислать текстом без реальных ников и IP.

### 1.5 Поддерживаемые движки и следствия для драйвера

| Движок            | Поддержка в LiteBans             | Чтение сайтом                                                                                                                                                    |
| ----------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MySQL / MariaDB   | да (драйверы `mysql`, `mariadb`) | да, решение владельца Q31: движок MySQL, драйвер `mysql2` (единственный в первой реализации)                                                                     |
| PostgreSQL        | да (драйвер `pgsql`)             | вне решения Q31: не реализуется; возможен позже по отдельному решению (драйвер `pg`)                                                                             |
| H2 (по умолчанию) | да, файл на диске плагина        | НЕТ: встроенная файловая БД без удалённого доступа. Нужна конвертация в MySQL/MariaDB (`/litebans import start`, см. Importing) либо путь через Bridge (этап 03) |

Следствия: по Q31 адаптер реализует один диалект (MySQL, `mysql2`) за интерфейсом `PunishmentSource`. В `pnpm-lock.yaml` сейчас нет ни `mysql2`, ни `pg` (проверено поиском), значит `mysql2` — новая зависимость и изменение lockfile; зависимость разрешена владельцем (Q29), установка только после освобождения диска (P3-06a). Prisma для чтения чужой БД не используется: второй datasource потребовал бы отдельной схемы и генерации клиента.

Решение: первая реализация поддерживает только MySQL (совместимый MariaDB допустим, если владелец подтвердит при сверке); PostgreSQL-шаблоны ниже сохранены как справка и не входят в реализацию.

## 2. Доступ к БД LiteBans

### 2.1 Принципы и гарантия «только чтение»

Гарантия многоуровневая:

1. Права пользователя БД: только `SELECT` на таблицы `litebans_*` (Q31, п. 2), на уровне столбцов, без столбца `ip` в таблицах наказаний и в `history`. Пользователя создаёт владелец; шаблон и порядок — `docs/runbooks/litebans-db-access.md`.
2. Каждый запрос выполняется внутри read-only транзакции (`START TRANSACTION READ ONLY` / `BEGIN READ ONLY`); для PostgreSQL дополнительно `default_transaction_read_only = on` на роли.
3. В адаптере нет write-методов: низкоуровневый метод принимает только заранее объявленные SQL-строки, единственное динамическое место — построитель списка `IN (...)` с числом плейсхолдеров из белого списка (1, 10, 100, 500). Статический модульный тест требует: строка начинается с `SELECT`; нет `;`, `FOR UPDATE`, `LOCK IN SHARE MODE`, `INTO`, `SLEEP`, `BENCHMARK` и комментариев `--`; значения только параметрами. Имя таблицы строится из префикса, проверенного регулярным выражением (латиница, цифры и `_`, до 32 символов), и всегда берётся в кавычки идентификатора.
4. Только явный список столбцов (никаких `SELECT *`): новые столбцы LiteBans не попадут на сайт случайно, а запрет на `ip` обеспечивает сама БД.
5. Тайм-аут запроса 5 с, пул из 2 соединений, лимит строк на запрос.

### 2.2 Шаблоны SQL (выполняет владелец; пароль задаёт владелец, агенту он не передаётся)

Краткая справка; рабочая инструкция владельцу, включая сеть, TLS и проверку, — в `docs/runbooks/litebans-db-access.md`.

Имя БД `litebans`, префикс `litebans_`, хост сайта `<ХОСТ_САЙТА>` подставляет владелец.

```sql
-- MySQL / MariaDB
CREATE USER 'twomc_ro'@'<ХОСТ_САЙТА>' IDENTIFIED BY '<ПАРОЛЬ_ЗАДАЁТ_ВЛАДЕЛЕЦ>'
  REQUIRE SSL WITH MAX_USER_CONNECTIONS 3;

GRANT SELECT (id, uuid, reason, banned_by_uuid, banned_by_name, removed_by_uuid, removed_by_name,
              removed_by_reason, removed_by_date, `time`, `until`, template, server_scope,
              server_origin, silent, ipban, ipban_wildcard, active)
  ON `litebans`.`litebans_bans` TO 'twomc_ro'@'<ХОСТ_САЙТА>';
-- то же для litebans_mutes; для litebans_warnings добавить столбец warned
GRANT SELECT (id, uuid, reason, banned_by_uuid, banned_by_name, `time`, `until`, template,
              server_scope, server_origin, silent, ipban, ipban_wildcard, active)
  ON `litebans`.`litebans_kicks` TO 'twomc_ro'@'<ХОСТ_САЙТА>';
GRANT SELECT (id, uuid, name, date) ON `litebans`.`litebans_history` TO 'twomc_ro'@'<ХОСТ_САЙТА>';
GRANT SELECT (id, name, uuid, date) ON `litebans`.`litebans_servers` TO 'twomc_ro'@'<ХОСТ_САЙТА>';

-- проверка: ни одного INSERT / UPDATE / DELETE
SHOW GRANTS FOR 'twomc_ro'@'<ХОСТ_САЙТА>';
```

```sql
-- PostgreSQL (схема public; хост разрешается строкой hostssl в pg_hba.conf)
CREATE ROLE twomc_ro LOGIN PASSWORD '<ПАРОЛЬ_ЗАДАЁТ_ВЛАДЕЛЕЦ>' CONNECTION LIMIT 3;
ALTER ROLE twomc_ro SET default_transaction_read_only = on;
ALTER ROLE twomc_ro SET statement_timeout = '5s';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE TEMP ON DATABASE litebans FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM twomc_ro;
GRANT USAGE ON SCHEMA public TO twomc_ro;
GRANT SELECT (id, uuid, reason, banned_by_uuid, banned_by_name, removed_by_uuid, removed_by_name,
              removed_by_reason, removed_by_date, "time", "until", template, server_scope,
              server_origin, silent, ipban, ipban_wildcard, active)
  ON litebans_bans, litebans_mutes TO twomc_ro;
-- warnings (+ warned), kicks, history (id, uuid, name, date), servers: по аналогии
```

Допущение: столбцы PostgreSQL названы так же, как в MariaDB. Требует сверки (1.4).

### 2.3 Переменные окружения (только имена; значения владелец кладёт в хранилище секретов)

| Переменная                                                       | Назначение                                                                                                                                                  | Секрет                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `LITEBANS_ENABLED`                                               | включатель интеграции; по умолчанию выключено                                                                                                               | нет                                     |
| `LITEBANS_DB_DRIVER`                                             | `mysql` (по Q31 единственное значение в первой реализации; `postgres` не поддерживается)                                                                    | нет                                     |
| `LITEBANS_DB_HOST`, `LITEBANS_DB_PORT`, `LITEBANS_DB_NAME`       | адрес и имя БД                                                                                                                                              | хост не попадает в репозиторий и отчёты |
| `LITEBANS_DB_USER`, `LITEBANS_DB_PASSWORD`                       | read-only учётка                                                                                                                                            | пароль: да                              |
| `LITEBANS_DB_SSL`                                                | `required` означает проверку сертификата и имени хоста (verify-full); без `LITEBANS_DB_SSL_CA_FILE` в production старт отклоняется; `disabled` только в dev | нет                                     |
| `LITEBANS_DB_SSL_CA_FILE`                                        | путь к CA-файлу                                                                                                                                             | нет                                     |
| `LITEBANS_TABLE_PREFIX`                                          | по умолчанию `litebans_`                                                                                                                                    | нет                                     |
| `LITEBANS_POLL_INTERVAL_MS`                                      | 1500 (границы 500..10000)                                                                                                                                   | нет                                     |
| `LITEBANS_BATCH_SIZE`                                            | 500                                                                                                                                                         | нет                                     |
| `LITEBANS_ACTIVE_CHECK_INTERVAL_S`                               | 15                                                                                                                                                          | нет                                     |
| `LITEBANS_RECONCILE_INTERVAL_MIN`                                | 60 (полная сверка)                                                                                                                                          | нет                                     |
| `LITEBANS_DB_CONNECT_TIMEOUT_MS`, `LITEBANS_DB_QUERY_TIMEOUT_MS` | по умолчанию 5000 и 5000                                                                                                                                    | нет                                     |

Fail-closed: при `LITEBANS_ENABLED=true` без обязательных переменных поллер не стартует, статус «не настроено», фальшивых данных нет; в production `LITEBANS_DB_SSL=disabled` отвергается (по образцу ADR-0164).

### 2.4 Сеть

Сайт и БД LiteBans чаще всего на разных машинах. Варианты: (a) allowlist IP сайта в firewall плюс TLS (минимум); (b) VPN/WireGuard или SSH-туннель; (c) не открывать БД и использовать Bridge (этап 03). Решение владельца (Q31, п. 3): сетевой доступ и TLS настраивает владелец сам по инструкции `docs/runbooks/litebans-db-access.md` (вариант (a) с `REQUIRE SSL`, цель (c)). Открытый порт БД в интернет без allowlist недопустим. Пароль и IP хоста в репозиторий и отчёты не попадают.

## 3. Контракт адаптера PunishmentSource

Контракт не знает про LiteBans: LiteBans-адаптер и будущий Bridge-источник (этап 03) реализуют один интерфейс. Остальной код (синхронизатор, API, WebSocket) зависит только от него. Тестовый источник допустим только в тестах и dev (`NODE_ENV` in {development, test}), не в продуктовом коде.

### 3.1 Нормализованная модель NormalizedPunishment

| Поле          | Тип                                          | Описание                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`        | `BAN`, `MUTE`, `WARN`, `KICK`                | тип                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `sourceId`    | строка (десятичная запись bigint)            | `id` в таблице источника; пара `(kind, sourceId)` — ключ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `subjectUuid` | строка в нижнем регистре с дефисами или null | null для IP-только и значений `#...`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `subjectName` | строка или null                              | разрешается через `history` (последний ник по uuid); у IP-бана null                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ipBan`       | boolean                                      | сам IP не читается и наружу не выдаётся                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `reason`      | строка или null, до 2048                     | очищена: цветовые коды, hex-цвета, управляющие и bidi-символы (U+202A–202E, U+2066–2069) удалены, переводы строк сохранены; для публичного показа ОБЯЗАТЕЛЬНО (Q31: IP и контактные данные не показываются никогда) скрываются IPv4/IPv6, e-mail, телефоны, URL и контактные идентификаторы (Discord, Telegram и подобные), так как модераторы пишут их в причинах; вывод только как plain text без автоссылок; при сомнении фрагмент скрывается. Те же очистка и удаление bidi относятся к `subjectName`, `executor*`, `scope`, `origin` |
| `executor`    | `{uuid, name}`, `{console}` или null         | по умолчанию скрыт в публичных ответах (раздел 6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `startedAt`   | ISO UTC                                      | из `time` (мс)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `until`       | ISO UTC или null                             | null при `until <= 0` (бессрочно)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `status`      | `ACTIVE`, `EXPIRED`, `REMOVED`               | вычисляется (3.3), не из `active`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `removal`     | `{by, reason, at}` или null                  | только для `REMOVED`; `at` из `removed_by_date`, когда задан `removed_by_*`                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `scope`       | строка или null                              | `server_scope`; `*` = глобально                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `origin`      | строка или null                              | `server_origin`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `silent`      | boolean                                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `template`    | число или null                               | 255 превращается в null                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `rowHash`     | строка                                       | SHA-256 нормализованных полей; нужен для дедупликации и обнаружения правок                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

### 3.2 Методы

```ts
interface PunishmentSource {
  readonly id: 'litebans' | 'bridge' | 'test';
  health(): Promise<SourceHealth>; // {ok, version?, serverTimeMs, code?}
  fetchBatch(kind: PunishmentKind, afterId: bigint, limit: number): Promise<NormalizedPunishment[]>; // по возрастанию id
  fetchByIds(
    kind: PunishmentKind,
    ids: bigint[],
  ): Promise<{ found: NormalizedPunishment[]; missing: bigint[] }>; // до 500 за вызов
  maxId(kind: PunishmentKind): Promise<bigint>;
  resolveNames(uuids: string[]): Promise<Map<string, string>>; // из history
  subscribe?(handler: (e: SourceEvent) => void): Disposable; // у Bridge: push; у LiteBans нет
  close(): Promise<void>;
}
```

Write-методов в интерфейсе нет и быть не может. `subscribe` необязателен: LiteBans-адаптер его не реализует (источник — опрос), Bridge-источник реализует (раздел «События наказаний» в `docs/stage-03/BRIDGE-CONTRACT.md`). Если `subscribe` есть, опрос становится только страховочной сверкой.

### 3.3 Вычисление статуса

```
now = серверное время источника (с поправкой на расхождение, см. 4.5)
если заполнено removed_by_uuid или removed_by_name         -> REMOVED
иначе если active = 0                                       -> EXPIRED
иначе если until > 0 и until <= now                         -> EXPIRED
иначе                                                       -> ACTIVE
```

Допущение: снятие всегда заполняет `removed_by_*`; требует сверки. Для `kick` статус всегда `EXPIRED` (разовое событие в истории). Для `warn` активность трактуется по тем же правилам; смысл `warned` не используется.

### 3.4 Ошибки

- `SourceNotConfigured`: не заданы обязательные переменные.
- `SourceUnavailable`: сеть или тайм-аут; повторяемая.
- `SourceAuthFailed`: не повторять, тревога.
- `SourceSchemaMismatch`: нет ожидаемого столбца или типа; остановить поллер этой таблицы, статус «требует сверки».
- `SourceDataInvalid`: строка пропускается и считается в метрике.

Тексты ошибок не содержат хост, учётку, пароль и SQL с данными.

## 4. Синхронизация

### 4.1 Хранение

Зеркальные таблицы (раздел 7): миграции создаются по Q28 (только на одноразовой локальной БД, обязательное ревью expand/contract, без деструктивных операций; на production применяет владелец). До применения миграции возможен только режим «без зеркала» (Redis-кэш, живые запросы к LiteBans, WebSocket по водяному знаку в памяти). Он не даёт стабильной связи с обжалованием, скрытия записей и истории при чистке LiteBans, поэтому не рекомендуется.

### 4.2 Слои

| Слой | Частота | Что делает                                                                                                                                                                                  |
| ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | запуск  | Первичная загрузка: `fetchBatch` по `id` с 0, пачки по `LITEBANS_BATCH_SIZE`, upsert в транзакции, курсор после каждой пачки. События клиентам НЕ рассылаются (статус «идёт загрузка»)      |
| 1    | 1–2 с   | Новые строки: `WHERE id > :cursor - :overlap ORDER BY id LIMIT :n`. `overlap` по умолчанию 100 id: защита от транзакций, фиксируемых не по порядку id. Дубликаты отсекаются по `rowHash`    |
| 2    | 15 с    | Сверка активных: для всех зеркальных строк со статусом `ACTIVE` вызов `fetchByIds` пачками по 500. Обнаруживает снятие, изменение причины и срока, пропажу строки                           |
| 3    | 60 мин  | Полная сверка: чтение всей таблицы пачками по диапазонам `id`, сравнение `rowHash` с зеркалом. Обнаруживает удаление (`--delete`, prune) и правки неактивных строк; с ограничением скорости |
| T    | таймер  | Истечение: сайт держит ближайший `until` среди активных строк и в момент срока переводит строку в `EXPIRED` с событием (LiteBans этого не делает)                                           |

Почему нужен слой 2: изменения существующих строк (`active`, `removed_by_*`, `reason`, `until`) водяной знак по `id` не видит. Выборка по `removed_by_date` не используется: на столбце нет индекса, и он не маркер снятия (1.2). Объём слоя 2: `ceil(активных / 500)` запросов по PK каждые 15 с. При более чем 20 000 активных реже опрашивать или перейти на выборку `WHERE active = 1` по индексу.

Допущение: число активных наказаний порядка сотен-тысяч; уточнить при сверке (`COUNT(*)`).

### 4.3 Дедупликация и порядок

- Ключ `(kind, sourceId)` уникален. Upsert сравнивает `rowHash`: без изменений нет ни записи, ни события. Повторное чтение (overlap, перезапуск) безвредно.
- Изменение увеличивает `rev` записи. Клиент отбрасывает события с `rev` не выше известного.
- Глобальный порядок: `seq` растёт на каждое отправленное событие (Redis `INCR`); порядок гарантирован внутри процесса-лидера.
- Опрашивает один экземпляр API: лидерство через Redis `SET key <случайный токен> NX PX 10000`; продление и освобождение — только Lua compare-and-set по токену, `seq` и запись зеркала допускаются только при действующем токене (пауза процесса не даёт двух лидеров). При потере токена поллер останавливается. У Socket.IO в текущем коде нет Redis-адаптера (проверено в `websocket-adapter.ts`), поэтому при нескольких экземплярах API события надо доставлять через Redis pub/sub; до этого допустим один экземпляр.

### 4.4 Восстановление после разрыва

- Курсор фиксируется в той же транзакции, что и upsert пачки: рассинхрон невозможен, повтор безопасен.
- Ошибка БД LiteBans: экспоненциальная пауза 1–30 с с джиттером; статус `degraded`; клиентам `sync:status` со `stale: true` и временем начала; при отставании больше 60 с публичная страница показывает «данные могут быть неактуальны».
- После восстановления: слой 1 от курсора с `overlap`, немедленный слой 2.
- Перезапуск API: курсор берётся из БД; неполная первичная загрузка продолжается с курсора.
- Откат или восстановление БД LiteBans из бэкапа (`maxId` меньше курсора): статус «требует сверки», запуск слоя 3; сброс курсора только вручную админом (аудит), данные автоматически не теряются.

### 4.5 Время, часовые пояса, DST

- `time` и `until` — мс UTC; сайт хранит `timestamptz`, DST на значения не влияет. Отображение — в часовом поясе браузера.
- Соединение открывается с явным UTC (`SET time_zone = '+00:00'` для MySQL/MariaDB, `SET TIME ZONE 'UTC'` для PostgreSQL), чтобы `removed_by_date` (`timestamp`) читался однозначно.
- Расхождение часов: раз в минуту адаптер читает серверное время БД и хранит смещение относительно часов сайта; статус «истёк» считается по времени БД, допуск 5 с. LiteBans требует NTP на серверах (Timezones).
- Опция `use_database_time` в LiteBans у владельца: уточнить при сверке.

### 4.6 Push клиентам (WebSocket)

Новый namespace `/punishments` в существующем Socket.IO. Аутентификация как в остальных namespace; публичная комната допускает анонима.

| Комната         | Кто входит                                     | Что получает                                                             |
| --------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| `public`        | любой клиент                                   | урезанные публичные события (без uuid, executor, ip, внутренних заметок) |
| `user:{userId}` | владелец аккаунта (по `MinecraftAccount.uuid`) | события о своих наказаниях, включая причину снятия                       |
| `staff`         | право `users.punishments`                      | полные события зеркала без ip                                            |

События: `punishment:created`, `punishment:updated` (изменение причины или срока), `punishment:removed` (снятие), `punishment:expired`, `punishment:hidden` (скрыто админом; публично приходит как удаление из списка), `punishment:deleted` (исчезло в источнике), `sync:status`, `resync` (клиенту перечитать список через REST). Каждое событие несёт `seq`, `rev`, `ref`.

Реконнект: клиент шлёт `lastSeq`; потоки Redis (`MAXLEN` около 10 000, срок 1 ч) ведутся ОТДЕЛЬНО для комнат: публичный поток содержит только уже отфильтрованные события, а сквозной `seq` публично не показывается (пропуски раскрывали бы скрытые записи; в публичной комнате свой счётчик). При разрыве больше буфера сервер шлёт `resync`. Лимиты: до 5 подключений на пользователя и лимит по IP, общий потолок подключений к `public`, throttle REST `/bans` и поиска по нику, события склеиваются не чаще 1 пачки в 250 мс, клиент ничего не публикует (только подписка). Вход в `user:{userId}` и `staff` определяется только серверной сессией (комнаты от клиента не принимаются), проверяется `Origin` (защита от cross-site WebSocket hijacking), при смене привязки uuid или прав подписка разрывается.

Приватность: публичные события строятся по белому списку полей (`ref, kind, subjectName, reason, startedAt, until, status, scope`; `reason` уже очищена), а не вычитанием лишнего. Публичная комната получает событие только если запись проходит тот же предикат, что и публичный REST: тип BAN или MUTE, не `isHidden`, не `DELETED_AT_SOURCE`, раздел включён, учтены `hideSilent` и `hideIpBans`. При переходе из публичной в непубличную шлётся только `punishment:hidden` (событие `punishment:deleted` публично не отправляется). `reason` по Q31 входит в публичные поля, но только после обязательной очистки (3.1, раздел 6): IP, e-mail, телефоны, URL и контактные идентификаторы удаляются всегда, без возможности отключить.

## 5. Сайт

### 5.1 Публичные страницы

- `/bans` (новый маршрут; в `apps/web/src/app/(site)` его сейчас нет). Решение владельца Q31, п. 5: публично показываются ник, тип, причина, даты (начало и срок) и признак активности; данные выдавшего скрыты по умолчанию; IP и любые контактные данные не показываются никогда. Список с фильтрами (тип, статус, область), поиск по нику (без учёта регистра, префикс, 3–16 символов), курсорная пагинация, живые обновления из комнаты `public`, индикатор «данные устарели». Дизайн «Полдень» (solid-оверлеи, без blur).
- `/bans/[ref]`: карточка `ban-123`; публичные поля по настройкам; «Обжаловать» только для вошедшего владельца.
- Допущение: публичны только `BAN` и `MUTE`; `WARN` и `KICK` видны только владельцу и персоналу (рекомендация; Q31 перечисляет публичные поля `/bans` для наказаний вообще, публичность WARN и KICK остаётся открытым вопросом О1 (раздел 11)).

### 5.2 «Мои наказания»

Раздел профиля или настроек. Выборка строго по `MinecraftAccount.uuid` текущего пользователя (подтверждён игрой, ADR-0072); по нику НЕ выбирается (ник можно переиспользовать, возможен угон чужой истории). Нет привязки — подсказка «привяжите Minecraft». Показывает полную историю (включая причину снятия), статус, срок, область, кнопку «Обжаловать». Угроза оффлайн-UUID: при `online_mode: false` без подтверждённой аутентификации игрока любой может зайти под ником забаненного, привязать его оффлайн-UUID и увидеть историю или обжаловать чужой бан. Поэтому если UUID оффлайн-типа (версия 3) и нет подтверждённой аутентификации, «Мои наказания» и обжалование по такой привязке отключаются (проверка при сверке, 1.4).

### 5.3 Связь с обжалованием

Существующий поток (срез 2) обжалует `UserPunishment` (cuid) и проверяет владельца, обжалуемость и дубли в `lockAndValidateAppeal`. У `UserPunishment` поле `issuedBy` обязательно и ссылается на `User`, поэтому записывать наказания LiteBans в эту таблицу нельзя без фиктивного пользователя-выдающего.

Решение: добавить nullable `Report.appealedMinecraftPunishmentId` (FK на зеркало; задано не более одного из двух полей; заблокировано: миграция). `?punishment=` принимает либо cuid, либо публичный `ref` (`ban-123`). `lockAndValidateAppeal` получает ветку для зеркала: `SELECT ... FOR UPDATE` строки зеркала; владелец по `subjectUuid`; обжалуем только `ACTIVE` `BAN` или `MUTE` (и `WARN`, если решит владелец); дубль по открытому обращению — 409; чужое или несуществующее — одинаковый 404. В карточке обращения: тип, ref, срок, статус (без данных выдавшего для игрока по умолчанию).

### 5.4 Админ-управление (без записи в LiteBans)

Возможно:

- просмотр полного зеркала и истории изменений;
- скрыть или показать запись публично (`isHidden` и причина, аудит);
- внутренняя заметка к записи;
- настройки публичности (раздел 6);
- статус синхронизации, принудительная пересверка слоёв 2 и 3, ручной сброс курсора (с подтверждением и аудитом).

Невозможно (нужна запись в LiteBans, вне этапа): выдать, снять, изменить срок. В UI не предлагаются.

Права: скрытие записей и заметки не должны быть доступны любому модератору через общее `users.punishments` (можно скрыть собственную запись, утаив злоупотребление). До решения владельца: скрытие и настройки публичности — только вместе с обязательной причиной и записью в `AuditLog`, видимой другому администратору; целевое состояние — отдельные права `punishments.hide` и `punishments.settings` (потребуют seed, вопрос О3 раздела 11). Все действия пишутся в `AuditLog`.

## 6. Политика публичности (по умолчанию закрыто)

| Данные                   | По умолчанию                                                       | Настройка (`SiteSetting`)                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Страница `/bans`         | включается флагом при релизе; 152-ФЗ не блокирует (Q31)            | `punishments.public.enabled` (по умолчанию false до релиза реализации; fail closed)                                                            |
| Ник нарушителя           | показан (Q31)                                                      | нет                                                                                                                                            |
| Тип, даты, активность    | показаны (Q31): тип, начало, срок, признак активности              | нет                                                                                                                                            |
| UUID                     | не публикуется                                                     | нет                                                                                                                                            |
| Выдавший (имя, UUID)     | СКРЫТ (Q31)                                                        | `punishments.public.showExecutor` (по умолчанию false)                                                                                         |
| Причина                  | ПОКАЗАНА (Q31), всегда после очистки (3.1)                         | очистка IP, e-mail, телефонов, URL, контактов не отключается; `punishments.public.showReason` может скрыть причину целиком (по умолчанию true) |
| `silent` и IP-баны       | IP-баны без ника не показываются; silent показываются              | `punishments.public.hideSilent`, `punishments.public.hideIpBans`                                                                               |
| Причина снятия, кто снял | скрыты публично, видны владельцу                                   | нет                                                                                                                                            |
| IP и контактные данные   | НИКОГДА (Q31): IP не читается из БД, контакты вырезаются из текста | нет                                                                                                                                            |

Персональные данные: ник и UUID игрока — идентификаторы. Решение владельца (Q31): юридическую оценку 152-ФЗ владелец записывает сам отдельно, реализацию она не блокирует; UUID по-прежнему не публикуется.

## 7. Предлагаемые модели (миграция по Q28)

Только текст. Миграции и `prisma migrate` в рамках этого документа не запускались. Миграции создаются позже по Q28: `migrate dev` / `migrate diff` только на одноразовой локальной БД, ревью каждой миграции по expand/contract (модели ниже только добавляют таблицы и nullable-колонку), деструктивных операций нет, применение к production выполняет только владелец.

```prisma
enum MinecraftPunishmentKind {
  BAN
  MUTE
  WARN
  KICK
}

enum MinecraftPunishmentStatus {
  ACTIVE
  EXPIRED
  REMOVED
  DELETED_AT_SOURCE
}

model MinecraftPunishment {
  id                String                    @id @default(cuid())
  source            String                    @default("litebans") @db.VarChar(16)
  kind              MinecraftPunishmentKind
  sourceScope       String                    @default("default") @db.VarChar(32)
  sourceId          BigInt
  subjectUuid       String?                   @db.VarChar(36)
  subjectName       String?                   @db.VarChar(16)
  ipBan             Boolean                   @default(false)
  reason            String?                   @db.Text
  executorUuid      String?                   @db.VarChar(36)
  executorName      String?                   @db.VarChar(128)
  executorIsConsole Boolean                   @default(false)
  removedByUuid     String?                   @db.VarChar(36)
  removedByName     String?                   @db.VarChar(128)
  removedReason     String?                   @db.Text
  removedAt         DateTime?
  startedAt         DateTime
  until             DateTime?
  status            MinecraftPunishmentStatus
  serverScope       String?                   @db.VarChar(32)
  serverOrigin      String?                   @db.VarChar(32)
  silent            Boolean                   @default(false)
  template          Int?
  rowHash           String                    @db.VarChar(64)
  rev               Int                       @default(1)
  isHidden          Boolean                   @default(false)
  hiddenById        String?
  hiddenReason      String?
  firstSeenAt       DateTime                  @default(now())
  lastSeenAt        DateTime                  @default(now())
  lastChangedAt     DateTime                  @default(now())
  deletedAtSource   DateTime?

  reports Report[] @relation("ReportAppealedMinecraftPunishment")

  @@unique([source, sourceScope, kind, sourceId])
  @@index([subjectUuid, startedAt])
  @@index([status, startedAt])
  @@index([kind, status, isHidden, startedAt])
  @@map("minecraft_punishments")
}

model PunishmentSyncState {
  id                  String                  @id @default(cuid())
  source              String                  @db.VarChar(16)
  kind                MinecraftPunishmentKind
  cursorId            BigInt                  @default(0)
  lastPollAt          DateTime?
  lastSuccessAt       DateTime?
  lastActiveCheckAt   DateTime?
  lastFullReconcileAt DateTime?
  consecutiveFailures Int                     @default(0)
  lastErrorCode       String?                 @db.VarChar(32)
  initialSyncDoneAt   DateTime?

  @@unique([source, kind])
  @@map("punishment_sync_state")
}

// PunishmentAdminNote: id, punishmentId, authorId, content, createdAt
```

SQL-набросок (по Q28 генерируется Prisma на одноразовой БД; набросок справочный):

```sql
CREATE TYPE "MinecraftPunishmentKind" AS ENUM ('BAN','MUTE','WARN','KICK');
CREATE TYPE "MinecraftPunishmentStatus" AS ENUM ('ACTIVE','EXPIRED','REMOVED','DELETED_AT_SOURCE');
-- CREATE TABLE minecraft_punishments (...) и punishment_sync_state (...) по моделям выше
CREATE INDEX minecraft_punishments_lower_name_idx
  ON minecraft_punishments (lower("subjectName"), "startedAt" DESC);
ALTER TABLE reports ADD COLUMN "appealedMinecraftPunishmentId" TEXT
  REFERENCES minecraft_punishments(id);
ALTER TABLE reports ADD CONSTRAINT reports_one_appealed_punishment
  CHECK ("appealedPunishmentId" IS NULL OR "appealedMinecraftPunishmentId" IS NULL);
CREATE INDEX reports_appealed_mc_punishment_idx ON reports ("appealedMinecraftPunishmentId");
```

Upsert зеркала одной командой: `INSERT ... ON CONFLICT (source, "sourceScope", kind, "sourceId") DO UPDATE SET ..., rev = minecraft_punishments.rev + 1 WHERE minecraft_punishments."rowHash" <> EXCLUDED."rowHash" RETURNING (xmax = 0) AS inserted, rev` (по `xmax` отличается вставка от обновления). `rowHash` не включает поля, вычисляемые от текущего времени (статус «истёк»), чтобы не давать ложных изменений. `time` и `until` проверяются по диапазону до превращения в дату (иначе `SourceDataInvalid`). Для LiteBans допустим один писатель на `(source, sourceScope)`; публичный `ref` вида `ban-123` действует при единственном источнике, при нескольких к нему добавляется область. Допущение: выполняется через `$executeRaw` внутри транзакции.

## 8. Тест-план (после решений владельца; Docker только локально)

Допущение: ОЗУ мало, поэтому один контейнер MariaDB (`--innodb-buffer-pool-size=64M`, лимит памяти 256 МБ) поднимается на время прогона и удаляется; PostgreSQL-вариант — отдельным прогоном. Схема создаётся из DDL, восстановленного по разделу 1.2; сверить с реальным `SHOW CREATE TABLE`, когда владелец пришлёт. Данные синтетические (ники `TestPlayer001` и далее, сгенерированные UUID, без реальных людей). Боевая БД LiteBans в тестах не используется ни при каких условиях.

| №   | Сценарий                | Проверка                                                                                                                                                       |
| --- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Первичная синхронизация | 100 000 строк в трёх таблицах: курсор доходит до `maxId`, число строк совпадает, событий клиентам 0                                                            |
| 2   | Новые наказания         | вставка в ТЕСТОВУЮ БД скриптом теста: событие в комнате `public` не позже 3 с                                                                                  |
| 3   | Снятие                  | `UPDATE active=0, removed_by_*`: слой 2 даёт `punishment:removed` не позже 20 с; зеркало `REMOVED`                                                             |
| 4   | Истечение               | `until` в прошлом при `active=1`: `EXPIRED` от таймера без изменения в БД                                                                                      |
| 5   | Удаление и правка       | `DELETE` и смена `reason`/`until`: слой 3 ставит `DELETED_AT_SOURCE` и шлёт `punishment:updated`                                                               |
| 6   | Разрыв и восстановление | остановка БД на 60 с: `sync:status` со stale, после старта нет потерь и дублей; перезапуск API посреди первичной загрузки                                      |
| 7   | Дубли и порядок         | две транзакции с обратным порядком фиксации id: overlap подбирает строку; повтор пачки не создаёт событий                                                      |
| 8   | Откат БД                | `maxId` меньше курсора: статус «требует сверки», данные не теряются                                                                                            |
| 9   | Права                   | попытки `INSERT`/`UPDATE` read-only учёткой отклонены БД; `SELECT ip` отклонён; статический тест SQL-констант                                                  |
| 10  | Приватность             | снимки публичных DTO и событий: нет `uuid`, `executor*`, `ip`, внутренних заметок при настройках по умолчанию                                                  |
| 11  | Типы                    | `bit(1)` (предположительно Buffer в mysql2, проверить), bigint как строка, значения `#`, консольный выдавший, NULL везде                                       |
| 12  | Нагрузка                | 1 млн строк; поток 100 вставок/с 5 минут; задержка от вставки до WebSocket p95 не выше 3 с; нагрузка на БД LiteBans в среднем не выше 5 запросов/с; память API |
| 13  | Сайт                    | e2e: `/bans`, поиск, «Мои наказания», обжалование (409 при дубле, 404 на чужое)                                                                                |

## 9. Риски

1. Схема боевой БД отличается от документации (версия, PostgreSQL): `SourceSchemaMismatch`, остановка таблицы, сверка до включения.
2. Изменения задним числом не видны опросу по `id`: закрыто слоями 2 и 3; задержка видимости удаления — до интервала слоя 3.
3. Раскрытие персональных данных и данных персонала: белый список полей, обязательная очистка причины от IP и контактов, выдавший скрыт по умолчанию, у учётки нет права читать `ip`; публичный раздел включается флагом при релизе.
4. Нагрузка на чужую боевую БД: пул 2, тайм-аут 5 с, запросы по PK, лимит пачек.
5. Несовпадение UUID (оффлайн и онлайн) сделает «Мои наказания» пустыми: проверка при сверке.
6. Нет Redis-адаптера у Socket.IO: до решения один экземпляр API.
7. Сеть до БД LiteBans (2.4).

## 10. Эволюция: замена на TwoMC Bridge

Контракт `PunishmentSource` (3.2) сохраняется. Bridge-источник реализует `subscribe` и те же `fetchBatch` и `fetchByIds` для сверки. Ключ `(kind, sourceId)` совпадает с id LiteBans, если плагин Bridge получает записи через LiteBans API (`entryAdded`, `entryRemoved`). Переключение — через `source` и конфигурацию, без изменения API, WebSocket и страниц. Подробности: `docs/stage-03/BRIDGE-CONTRACT.md`.

## 11. Решения владельца и оставшиеся вопросы

Решено (Q29, Q31, 2026-11-17):

1. Движок: MySQL; драйвер `mysql2` (зависимость разрешена, установка после освобождения диска, P3-06a). H2 и PostgreSQL вне реализации. Версию LiteBans, `SHOW CREATE TABLE`, префикс и `online_mode` владелец по-прежнему присылает для сверки (1.4).
2. Пользователь БД с правом SELECT только на `litebans_*` создаёт владелец, пароль агенту не передаётся (2.2, runbook).
3. Сетевой доступ и TLS настраивает владелец по `docs/runbooks/litebans-db-access.md` (2.4).
4. Миграции зеркальных таблиц и `Report.appealedMinecraftPunishmentId` создаются по Q28 (раздел 7); production применяет владелец.
5. `/bans`: публично ник, тип, причина, даты, активность; выдавший скрыт по умолчанию; IP и любые контактные данные не показываются никогда (раздел 6).
6. Юридическая оценка 152-ФЗ ведётся владельцем отдельно и реализацию не блокирует.

Остаются открытыми (не решено владельцем, значения по умолчанию из рекомендаций сохраняются):

О1. Публичность WARN и KICK, silent и IP-банов (рекомендация: только BAN и MUTE; IP-баны без ника не показывать).
О2. Обжалуемые виды (BAN, MUTE; WARN?). Рекомендация: BAN и MUTE.
О3. Права: использовать `users.punishments` или завести новые (нужен seed). Рекомендация: пока `users.punishments`.
О4. Тест-инфраструктура: локальный Docker с MySQL/MariaDB (лимит памяти 256 МБ) при свободной ОЗУ и команде «ресурсы свободны» (Q15).
О5. Срок хранения записей `DELETED_AT_SOURCE` (рекомендация: обнулять ник и причину через 30 дней), процедура скрытия по запросу субъекта, `noindex` и `robots` для `/bans/*` (рекомендация: так).

## 12. Независимое security-ревью дизайна (2026-11-17)

Ревью выполнил отдельный read-only security-специалист до коммита. Учтено в тексте: ключ зеркала с источником и областью (раздел 7); причина по умолчанию скрыта и редактирование IP, e-mail, URL, bidi (3.1, 6); предикат публичности для событий, раздельные потоки Redis и отсутствие публичного сквозного `seq`, лимиты по IP, проверка `Origin` (4.6); отключение «Мои наказания» и обжалования для оффлайн-UUID без аутентификации (5.2); права на скрытие записей (5.4); проверка SQL-констант и построитель `IN` (2.1); verify-full для TLS (2.3); `REVOKE` для `PUBLIC` в PostgreSQL (2.2); токен лидера с Lua compare-and-set (4.3); `RETURNING (xmax = 0)` и состав `rowHash` (7); срок хранения, процедура скрытия и `noindex` (вопрос 6).

Остаётся открытым: пороги тревог на всплеск изменений; отдельные права `punishments.hide` и `punishments.settings` (нужен seed); `REQUIRE X509` или `REQUIRE ISSUER` для учётки MySQL как усиление; юридическая оценка 152-ФЗ ведётся владельцем отдельно и включение публичного раздела не блокирует (Q31).
