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

### Формат подписи Bridge (сверен с `bridge-signature.guard.ts` и `Signer.java`)

`canonical = "twomc-bridge-v1" LF key-id LF timestamp LF nonce LF METHOD LF path LF sha256hex(сырое тело)`; `signature = hex(HMAC-SHA256(ключ_сервера, canonical))`. Заголовки: `x-twomc-key-id` (`<slug>.<поколение>`), `x-twomc-timestamp` (10 цифр, окно 60 с), `x-twomc-nonce` (base64url, 22-43 символа, одноразовый), `x-twomc-protocol: 1`, `x-twomc-signature` (64 hex), `Content-Type: application/json`. Webhook: `hex(HMAC-SHA256(PAYMENT_WEBHOOK_SECRET, "<ts>." + тело))`, заголовки `x-twomc-signature`, `x-twomc-timestamp`, окно 300 с, нонса нет.

## Белые списки доступа к панели (`ptero.sh`)

Даже при `PTERO_ALLOW_WRITE=1` всё вне списка отклоняется до обращения к панели.

- Пути записи/загрузки/переименования: только `plugins/TwoMCBridge/config.yml`, `plugins/TwoMCBridge/bridge-key.txt`, `plugins/TwoMCBridge-0.1.0.jar` (загрузка и переименование в `.disabled-<время>`), их `.bak-<время>` и `.disabled-<время>`. `create-folder` - только `/plugins/TwoMCBridge`; `chmod` - только `600` для `bridge-key.txt[.bak-<время>]`.
- Чтение: `server.properties`, `version_history.json`, `logs/latest.log`, `plugins/TwoMCBridge/config.yml`; список каталогов только `/` и `/plugins` (наличие `config.yml` и `bridge-key.txt` проверяется пробным GET в локальный файл 600). `bridge-key.txt` читается только в локальный файл 600 (для бэкапа), в вывод не попадает.
- Консольные команды: `say TwoMC: <текст из [A-Za-z0-9 .,:!?-]>`, `list`, `twomcbridge events`. `op`, `stop`, любые другие - отказ. Питание: только `restart`.
- Тело ответа панели очищается сразу после использования. `rollback-bridge.sh` и `verify-bridge.sh` запускаются только через `run-on-vds.sh script ...`; `verify-bridge.sh` включает запись только на время отправки `twomcbridge events`.

## Откат (без удаления)

Откат: `bash run-on-vds.sh script rollback-bridge.sh --dry-run`, затем `--yes` (запуск только через этот пакет): проверка игроков (тем же способом: SLP, затем websocket `list`) и `say`-предупреждение перед restart (те же правила: 60 с, повторная проверка, при новых игроках ещё `say` и 30 с), JAR переименовывается в `TwoMCBridge-0.1.0.jar.disabled-<время>`, сервер перезапускается. `config.yml` и `bridge-key.txt` остаются. Повторная установка после отката возможна: `.disabled-*` не считается установленным плагином.

## При ошибке

- Код 255 у `run-on-vds.sh`: сбой SSH, не повторять подряд, подождать и проверить общий lock.
- Handshake: `503` - не включены BRIDGE_ENABLED или секрет; `401` - slug или ключ не зарегистрированы; `basic-auth-gate` - нет обхода входа стенда; `NETERR` - сеть или TLS.
- «Безопасный режим» инвентаря или плагин не отвечает на `/twomcbridge events`: смотреть консоль в панели, затем откат.
- Принятых событий 0 при игроке онлайн: аккаунт не привязан (`skipped_unlinked`), проверить UUID (офлайн-UUID) в `MinecraftAccount`.
- Ключ мог попасть в чат или лог: считать скомпрометированным, ротация по разделу 2.4 `docs/stage-03/BRIDGE-CONTRACT.md` (владелец).
