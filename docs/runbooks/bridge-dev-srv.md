# Установка плагина TwoMC Bridge на dev-srv (Pterodactyl)

Назначение: поставить `TwoMCBridge-0.1.0.jar` на тестовый сервер dev-srv, чтобы проверить снимки статистики и инвентаря (выдача заказов выключена: `delivery.enabled: false`). Скрипты: `infrastructure/bridge-dev-srv/`. Все обращения к панели идут только с VDS и только к серверу из `SERVER_UUID`; запись закрыта `PTERO_ALLOW_WRITE=1` (его ставит только `--yes`).

## Где секреты (только пути, значения не читать и не печатать)

- `/home/twomc/pterodactyl-credentials.txt` (VDS, права 600): `PANEL_URL`, `SERVER_UUID`, `CLIENT_API_KEY`.
- `/home/twomc/bridge-dev-srv.secret.env` (VDS, права 600, пишет `register-dev-srv.sh`): `KEY_ID`, `KEY`, `SITE_URL` (прежний формат `BRIDGE_*` тоже принимается). Ключ выводит `bridge:print-key` внутри скрипта, в вывод он не попадает.
- Проверка файлов секретов: перед чтением `pterodactyl-credentials.txt`, `secret.env`, `test-website-credentials.txt` и `bridge-dev-bot.pass` скрипты требуют: обычный файл (не ссылка), права РОВНО 600, владелец - текущий пользователь; иначе отказ (код 1). Пути зафиксированы в скриптах и НЕ переопределяются переменными окружения; единственное исключение - тестовый режим `STAND_TEST=1` (сухие прогоны на фиктивных файлах: `BRIDGE_SECRET_ENV`, `PTERO_CRED_FILE`, `BOT_PASS_FILE`, `STAND_CRED_FILE`). Во всех скриптах `LC_ALL=C`.
- Сбой `chmod 600` на `bridge-key.txt` или `bridge-key.txt.bak-*` на панели - БЛОКЕР, не предупреждение: файл обнуляется (на панели нет удаления), установка останавливается; прежний ключ при необходимости перевыпускается владельцем.
- Бот: `npm i --ignore-scripts --no-audit --no-fund mineflayer@4.27.0` внутри контейнера, `npm ls --all` печатается в лог (строки `NPMLS`); файл пароля бота читается ботом один раз и сразу удаляется из контейнера.
- На сервере ключ лежит в `plugins/TwoMCBridge/bridge-key.txt` (права 600); `config.yml` секретов не содержит.

## Предусловия на сайте стенда (выполняет владелец или Chief)

1. `BRIDGE_ENABLED=true`, `BRIDGE_MASTER_SECRET` (не менее 32 байт), `BRIDGE_STATS_ENABLED=true`, `BRIDGE_INVENTORY_ENABLED=true`.
2. Регистрация сервера: `pnpm --filter @twomc/api run bridge:register -- --slug dev-srv --name "Dev SRV" --capabilities player-events,inventory-sync` (на стенде NODE_ENV=development или флаги владельца, см. `bridge-server-registration.md`).
3. Ключ: `bridge:print-key -- --slug dev-srv --generation 1 --print-key` (владелец) и запись в `secret.env`.
4. Плагин ходит на `<siteUrl>/bridge/v1/*` (`siteUrl` без `/api`). Стенд должен маршрутизировать `/bridge/v1/*` мимо формы входа (настраивает другая цепочка, `infrastructure/test-website/`; без этого handshake вернёт `basic-auth-gate`). Пока location нет, живая проверка подписей возможна через `/api/bridge/v1/*` (`live-sigcheck.sh --api-prefix`).
5. Тестовый игрок: `MinecraftAccount.uuid` должен совпасть с UUID на сервере. На dev-srv `online-mode=false`, поэтому это офлайн-UUID: `infrastructure/bridge-dev-srv/offline-uuid.sh <ник>`.

## Порядок (полный, со стендом)

Команды из каталога `infrastructure/bridge-dev-srv/`; всё, что помечено «VDS», идёт через `bash run-on-vds.sh script <имя>.sh <аргументы>` (скрипт бежит на VDS от пользователя `twomc`, вместе с `ptero.sh` и `stand-lib.sh`).

1. `stand-bridge-secret`: владелец или Chief задаёт `BRIDGE_MASTER_SECRET` (не менее 32 байт) в `stand.env` стенда. Скрипта в `infrastructure/bridge-dev-srv/` нет (область `infrastructure/test-website/`, вне этого среза): значение не печатать и не читать в чат.
2. `stand-flags`: `BRIDGE_ENABLED=true`, `BRIDGE_STATS_ENABLED=true`, `BRIDGE_INVENTORY_ENABLED=true`, `NODE_ENV=development` в `stand.env`, перезапуск api. Тоже вне этого среза. Для `/bridge/v1/*` нужен nginx location без входа стенда.
3. `register-dev-srv.sh --dry-run`, затем `--yes` (VDS): `bridge:register` (идемпотентно) и запись `KEY_ID`, `KEY`, `SITE_URL` в `/home/twomc/bridge-dev-srv.secret.env` (600). Ключ в вывод не попадает.
4. `link-account.sh <ник> --dry-run`, затем `--yes` (VDS): привязка тестового ника (офлайн-UUID) к админу стенда, иначе события будут `skipped_unlinked`. Условия отказа: `NODE_ENV` стенда не `development` (код 8); пользователь ищется строго по `username` (email из файла учёток не принимается), и он обязан быть админом стенда (роль с `isSuperuser`), иначе код 7.
5. Сборка JAR: `bash ../vds-runner/run-remote.sh java-build --worktree <worktree> --path plugins/bridge`; в сводке `tests=... failed=0`, sha256. Затем stage: `bash run-on-vds.sh stage <путь к TwoMCBridge-0.1.0.jar>` (панель не трогает).
6. `bash run-on-vds.sh install --dry-run`: только чтение (версия MC 1.21.4-1.21.11, Java 21, `online-mode`, отсутствие плагина, подписанный handshake). Блокеры (`BLOCKER:`) устранить, повторить.
7. `bash run-on-vds.sh install --yes [--sha256=<hex>]`: сверка sha256 JAR (по умолчанию `6aa484549a3bf7408b41893c1b5ab0f78caf2839a13e4be8a032343297d7a7a8`; несовпадение - BLOCKER, повторная сверка копии прямо перед загрузкой), бэкапы прежних `config.yml.bak-<время>` и `bridge-key.txt.bak-<время>` (600) перед перезаписью, `config.yml`, `bridge-key.txt`, JAR, проверка игроков (число игроков: основной способ - Server List Ping на адрес и порт аллокации dev-srv из временного node-контейнера, только чтение статуса, таймаут 5 с; запасной - команда `list` через websocket консоли до 30 с; не удалось ни так, ни так - BLOCKER, restart не выполняется; при игроках: `say`, 60 с, повторная проверка; если зашли новые - ещё `say` и 30 с), restart, `/twomcbridge events`. Код 0: сайт принял события; 3: установлено, ждём игрока. Установленным считается только точное имя `TwoMCBridge-0.1.0.jar`; `TwoMCBridge-0.1.0.jar.disabled-<время>` установке не мешает.
8. `bash run-on-vds.sh script bot-join.sh --check` (только GET: адрес и список `/plugins`), затем `bot-join.sh <ник> [секунды]`: `npm i --ignore-scripts mineflayer@4.27.0` (версия закреплена, поддерживает 1.21.4; `BOT_MINEFLAYER_VERSION` меняет её осознанно) ставится внутри временного контейнера node; при AuthMe/nLogin бот шлёт `/register` и `/login` со случайным паролем (файл `/home/twomc/bridge-dev-bot.pass`, 600). Пароль в env контейнера не передаётся: копия в файле 600 на tmpfs (`/dev/shm`) монтируется ro и затирается при выходе; вывод редактируется по самому паролю и по hex от 20 символов. Код 3: нужен ручной вход владельца.
9. Проверка на стенде: `bash run-on-vds.sh script verify-bridge.sh` (код 0: события приняты), в админке стенда видны статистика и инвентарь тестового игрока.
10. `bash run-on-vds.sh script live-sigcheck.sh [--loopback] [--no-payments] [--api-prefix]`: по умолчанию Bridge бьёт в `https://test-website.twomc.su/bridge/v1/events` (подписанный путь `/bridge/v1/events`, как у плагина); `--api-prefix` - в `/api/bridge/v1/events` (подписанный путь тот же). `SITE_URL` в `secret.env` обязан быть `https://test-website.twomc.su`, иначе отказ. Случаи Bridge: 4 дважды (2xx затем 401), 1 без подписи, 2 мусорная, 3 ts на 120 с старше; webhook `/api/webhooks/payments/test` (4 с несуществующим заказом, 1, 2, 3 с ts на 400 с старше: окно webhook 300 с). Печатает только «проверка | ожидалось | получено | PASS/FAIL».

**Только webhook оплаты (`--payments-only`, `--order`).** `bash run-on-vds.sh script live-sigcheck.sh --payments-only [--order <номер>] [--loopback]`: 4 случая webhook (нет подписи -> 401; мусорная подпись -> 401; верная подпись с ts -400 с -> 401; повтор), файл ключа Bridge `secret.env` не нужен и не читается; нужен `PAYMENT_WEBHOOK_SECRET` в `stand.env` (нет или короче 32 - ошибка, не SKIP). Несовместим с `--no-payments`. Без `--order` 4-й случай печатает `SKIP` (итог «все PASS» не означает, что повтор проверен). С `--order <номер>` одинаковый запрос `status=failed` уходит дважды на РЕАЛЬНЫЙ заказ: ждём 2xx `accepted`, затем 2xx `already_processed`. Внимание: заказ в `PENDING` будет переведён в `FAILED` необратимо - брать только одноразовый тестовый заказ с провайдером мока; заказ не в `PENDING` даст FAIL. Откат самого скрипта не нужен (Bridge и файлы не пишутся); заказ вернуть нельзя, только создать новый.

### Формат подписи Bridge (сверен с `bridge-signature.guard.ts` и `Signer.java`)

`canonical = "twomc-bridge-v1" LF key-id LF timestamp LF nonce LF METHOD LF path LF sha256hex(сырое тело)`; `signature = hex(HMAC-SHA256(ключ_сервера, canonical))`. Заголовки: `x-twomc-key-id` (`<slug>.<поколение>`), `x-twomc-timestamp` (10 цифр, окно 60 с), `x-twomc-nonce` (base64url, 22-43 символа, одноразовый), `x-twomc-protocol: 1`, `x-twomc-signature` (64 hex), `Content-Type: application/json`. Webhook: `hex(HMAC-SHA256(PAYMENT_WEBHOOK_SECRET, "<ts>." + тело))`, заголовки `x-twomc-signature`, `x-twomc-timestamp`, окно 300 с, нонса нет.

## Белые списки доступа к панели (`ptero.sh`)

Даже при `PTERO_ALLOW_WRITE=1` всё вне списка отклоняется до обращения к панели.

- Пути записи/загрузки/переименования: только `plugins/TwoMCBridge/config.yml`, `plugins/TwoMCBridge/bridge-key.txt`, `plugins/TwoMCBridge-0.1.0.jar` (загрузка и переименование в `.disabled-<время>`), их `.bak-<время>` и `.disabled-<время>`. `create-folder` - только `/plugins/TwoMCBridge`; `chmod` - только `600` для `bridge-key.txt[.bak-<время>]`.
- Чтение: `server.properties`, `version_history.json`, `logs/latest.log`, `plugins/TwoMCBridge/config.yml`; список каталогов только `/` и `/plugins` (наличие `config.yml` и `bridge-key.txt` проверяется пробным GET в локальный файл 600). `bridge-key.txt` читается только в локальный файл 600 (для бэкапа), в вывод не попадает.
- Консольные команды: `say TwoMC: <текст из [A-Za-z0-9 .,:!?-]>`, `list`, `twomcbridge events`. `op`, `stop`, любые другие - отказ. Питание: только `restart`.
- Тело ответа панели очищается сразу после использования. `rollback-bridge.sh` и `verify-bridge.sh` запускаются только через `run-on-vds.sh script ...`; `verify-bridge.sh` включает запись только на время отправки `twomcbridge events`.

## Порядок работ на dev-srv: status -> open -> install -> bot -> проверка -> sigcheck -> restore

Все шаги только через `bash run-on-vds.sh script <скрипт> ...`, только сервер из `SERVER_UUID`. Без секретов в выводе.

1. `devsrv-access.sh --status` (только чтение): whitelist, техработы, игроки онлайн (SLP), наличие state.
2. `devsrv-access.sh --open <ник...>`: бэкапы `.bak-<UTC>` ДО записи, `whitelist add`, выключение техработ, прежнее состояние в state.
3. `install-bridge.sh --dry-run`, затем `--yes`: перед перезапуском проверка игроков (SLP, затем `list`) и `say` с ожиданием 60 с (`ptero_restart_guard`).
4. `bot-join.sh`: бот заходит на сервер (аккаунт привязан, UUID офлайн). Контейнер: tmpfs 1g (был 300m: npm падал с ENOSPC), лимит памяти 1280m; перед запуском проверяется MemAvailable хоста (нужно не меньше 1400 МБ), иначе отказ до запуска контейнера. Для прямого входа при включённом форвардинге - `--open ... --direct-join` (раздел ниже).
5. Проверка: `verify-bridge.sh` и `slp-check.sh` (события приняты, плагин отвечает).
6. `live-sigcheck.sh`: проверка подписи на живом стенде.
7. `devsrv-access.sh --restore`: убирает только добавленные нами ники, возвращает техработы, печатает сверку со state. Если плагин не нужен - `rollback-bridge.sh` (тот же guard).

Перед любым перезапуском или остановкой (`restart`, `stop`, `kill`, консольные `stop`/`restart`) скрипт проверяет число игроков и пишет `say` за 60 с; без этого `ptero_power` отказывает. `devsrv-access.sh` без `--direct-join` сервер не перезапускает (только консольные `whitelist add|remove`, команды плагина техработ, правка config с последующим `reload` плагина). С `--direct-join` (и при `--restore` после него) перезапуск идёт через тот же guard (`ptero_restart_guard access`: проверка игроков, `say` за 60 с).

State-файл `/home/twomc/bridge-dev-srv.access.state`: права 600, запись атомарная (tmp + mv), повторный `--open` дополняет и не затирает прежние значения; после `--restore` переименовывается в `.restored-<UTC>`, не удаляется.

### Журнал изменений `/home/twomc/bridge-dev-srv.changes.log` (600)

Каждая изменяющая операция дописывает ровно одну строку из 5 колонок; без журнала запись отказывает. `--restore` пишет колонки «было/стало» по каждому параметру (ник, техработы, state).

| время UTC | файл | параметр | было | стало |
|---|---|---|---|---|
| 2026-11-28T10:00:00Z | /whitelist.json | whitelist: Alice | absent | added |
| 2026-11-28T10:00:05Z | /plugins/Maintenance/config.yml | maintenance | true | false |
| 2026-11-28T11:00:00Z | /whitelist.json | whitelist: Alice | added | removed |
| 2026-11-28T11:00:05Z | /plugins/Maintenance/config.yml | maintenance | false | true |

Значения очищаются: без `|`, управляющих символов, длинных hex и ключей, не длиннее 160 символов.

### Allowlist записи и денайлист команд (кратко)

- Запись и бэкап: только критичные файлы (`whitelist.json`, config плагина техработ, файлы TwoMCBridge) и их `.bak-<UTC>`; бэкап обязателен до записи. Причина: минимальная зона поражения и возможность отката без удаления.
- Запрещено: `world*/`, `playerdata`, чужие jar, `..` в путях, удаление/копирование/архивы. Причина: данные игроков и мир необратимы.
- Денайлист консоли: `plugman`, `plugins`-управление (load/unload/reload/delete), `reload`/`rl`, обёртки (`pm`, `pluginmanager`). `op`/`deop` разрешены только по политике ptero.sh. Причина: смена набора плагинов на живом сервере ломает состояние и обходит бэкап.
- Санитизация команд: CR/LF, табуляция, управляющие и не ASCII символы отклоняются, длина не более 256. Причина: инъекция второй команды через перевод строки.

## Прямой вход бота: `--open <ник...> --direct-join` (прокси-форвардинг)

Причина: на dev-srv включён IP-forwarding (`spigot.yml` `settings.bungeecord: true` и/или Velocity), а входит бот напрямую, без прокси: сервер кикает его с «If you wish to use IP forwarding, please enable it in your BungeeCord config as well!».

- `devsrv-access.sh --open <ник...> --direct-join`: к обычному `--open` добавляется выключение форвардинга: `spigot.yml` `settings.bungeecord` и `config/paper-global.yml` `proxies.velocity.enabled` ставятся в `false` (только если сейчас `true`). Затем restart через guard (игроки, `say` за 60 с) и ожидание `running` до 600 с (опрос каждые 5 с, прогресс в выводе).
- Правка точечная: заменяется одна строка ключа (отступ и комментарий сохраняются), файл целиком не перезаписывается, одноимённые ключи в других секциях (например `world-settings.default.bungeecord`) не затрагиваются. Секрет Velocity (`proxies.velocity.secret`) не читается и не печатается.
- Allowlist (ключи и только значения `true`/`false`): `spigot.yml` - `settings.bungeecord`; `config/paper-global.yml` - `proxies.bungee-cord.online-mode`, `proxies.velocity.enabled`, `proxies.velocity.online-mode`. Эти два пути недоступны для обычных чтения и записи, только через `ptero_yaml_get`/`ptero_yaml_set`.
- Бэкап: `<файл>.bak-<UTC>` рядом с файлом перед каждой записью. Журнал: файл / параметр / было / стало (например `/spigot.yml | settings.bungeecord | true | false`).
- Прежние значения четырёх ключей сохраняются в state (`FWD_SB`, `FWD_PB`, `FWD_VE`, `FWD_VO`; `-` = файла или ключа нет); повторный `--open` их не затирает. `--restore` возвращает сохранённые значения, снова перезапускает сервер и печатает сверку (`прокси-форвардинг <ключ> | было | стало | OK/DIFF`).
- Если проверка игроков не пройдена или сервер не вернулся в `running`, скрипт завершается с кодом 3: файлы уже изменены, перезапустите сервер вручную (или повторите `--restore`). `online-mode` в `server.properties` скрипт не меняет; при `online-mode=true` бот с офлайн-входом не войдёт (предупреждение, код 3).
- ПРЕДУПРЕЖДЕНИЕ: пока окно открыто (`online-mode=false` и форвардинг выключен), на сервер можно войти напрямую, минуя прокси. Whitelist остаётся включённым: входят только добавленные ники. Держите окно минимальным: сразу после проверки `devsrv-access.sh --restore`.

## Откат (без удаления)

Откат: `bash run-on-vds.sh script rollback-bridge.sh --dry-run`, затем `--yes` (запуск только через этот пакет): проверка игроков (тем же способом: SLP, затем websocket `list`) и `say`-предупреждение перед restart (те же правила: 60 с, повторная проверка, при новых игроках ещё `say` и 30 с), JAR переименовывается в `TwoMCBridge-0.1.0.jar.disabled-<время>`, сервер перезапускается. `config.yml` и `bridge-key.txt` остаются. Повторная установка после отката возможна: `.disabled-*` не считается установленным плагином.

## Проверка SLP и режим техработ

`bash run-on-vds.sh script slp-check.sh` (только чтение, без записи на панель): печатает `players=N/M version=V` (V без §-кодов, пробелы как `_`). Парсер SLP читает пакет по varint-длине (не ждёт закрытия сокета), строка JSON идёт с длиной в байтах UTF-8; при сбое в stderr печатается причина по каждой сети (`ERR:net-ECONNREFUSED`, `timeout-no-data`, `bad-json` и т. д.). Контейнер идёт сначала в сети bridge, затем host.

Если `version` содержит «Тех. работы»/maintenance/whitelist, сервер, вероятно, в режиме техработ или whitelist: бот войдёт только после добавления ника в whitelist владельцем (агент whitelist не меняет). `install-bridge.sh --dry-run` в этом случае печатает WARN (не блокер установки).

## При ошибке

- Сервер не вернулся в `running`: `ptero_wait_restart` ждёт до 600 с и печатает состояние при каждой смене (и раз в 30 с); в сообщении об ошибке - последнее состояние. Если оно `starting`, панель не увидела строку «Done» в консоли: смотрите консоль в панели.
- Загрузка JAR: signed URL панели приходит с JSON-экранированием (`/`, `&`); декодирует sed (`_pt_json_unescape`), не подстановка bash (в bash 5.2 `&` в замене означает найденный текст).
- Код 255 у `run-on-vds.sh`: сбой SSH, не повторять подряд, подождать и проверить общий lock.
- Handshake: `503` - не включены BRIDGE_ENABLED или секрет; `401` - slug или ключ не зарегистрированы; `basic-auth-gate` - нет обхода входа стенда; `NETERR` - сеть или TLS.
- «Безопасный режим» инвентаря или плагин не отвечает на `/twomcbridge events`: смотреть консоль в панели, затем откат.
- Принятых событий 0 при игроке онлайн: аккаунт не привязан (`skipped_unlinked`), проверить UUID (офлайн-UUID) в `MinecraftAccount`.
- Ключ мог попасть в чат или лог: считать скомпрометированным, ротация по разделу 2.4 `docs/stage-03/BRIDGE-CONTRACT.md` (владелец).
