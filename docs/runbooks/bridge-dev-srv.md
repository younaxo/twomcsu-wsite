# Установка плагина TwoMC Bridge на dev-srv (Pterodactyl)

Назначение: поставить `TwoMCBridge-0.1.0.jar` на тестовый сервер dev-srv, чтобы проверить снимки статистики и инвентаря (выдача заказов выключена: `delivery.enabled: false`). Скрипты: `infrastructure/bridge-dev-srv/`. Все обращения к панели идут только с VDS и только к серверу из `SERVER_UUID`; запись закрыта `PTERO_ALLOW_WRITE=1` (его ставит только `--yes`).

## Где секреты (только пути, значения не читать и не печатать)

- `/home/twomc/pterodactyl-credentials.txt` (VDS, права 600): `PANEL_URL`, `SERVER_UUID`, `CLIENT_API_KEY`.
- `/home/twomc/bridge-dev-srv.secret.env` (VDS, права 600, пишет `register-dev-srv.sh`): `KEY_ID`, `KEY`, `SITE_URL` (прежний формат `BRIDGE_*` тоже принимается). Ключ выводит `bridge:print-key` внутри скрипта, в вывод он не попадает.
- На сервере ключ лежит в `plugins/TwoMCBridge/bridge-key.txt` (права 600); `config.yml` секретов не содержит.

## Предусловия на сайте стенда (выполняет владелец или Chief)

1. `BRIDGE_ENABLED=true`, `BRIDGE_MASTER_SECRET` (не менее 32 байт), `BRIDGE_STATS_ENABLED=true`, `BRIDGE_INVENTORY_ENABLED=true`.
2. Регистрация сервера: `pnpm --filter @twomc/api run bridge:register -- --slug dev-srv --name "Dev SRV" --capabilities player-events,inventory-sync` (на стенде NODE_ENV=development или флаги владельца, см. `bridge-server-registration.md`).
3. Ключ: `bridge:print-key -- --slug dev-srv --generation 1 --print-key` (владелец) и запись в `secret.env`.
4. Для `/bridge/v1/*` на стенде нужен обход входа стенда (иначе handshake вернёт `basic-auth-gate`).
5. Тестовый игрок: `MinecraftAccount.uuid` должен совпасть с UUID на сервере. На dev-srv `online-mode=false`, поэтому это офлайн-UUID: `infrastructure/bridge-dev-srv/offline-uuid.sh <ник>`.

## Порядок (полный, со стендом)

Команды из каталога `infrastructure/bridge-dev-srv/`; всё, что помечено «VDS», идёт через `bash run-on-vds.sh script <имя>.sh <аргументы>` (скрипт бежит на VDS от пользователя `twomc`, вместе с `ptero.sh` и `stand-lib.sh`).

1. `stand-bridge-secret`: владелец или Chief задаёт `BRIDGE_MASTER_SECRET` (не менее 32 байт) в `stand.env` стенда. Скрипта в `infrastructure/bridge-dev-srv/` нет (область `infrastructure/test-website/`, вне этого среза): значение не печатать и не читать в чат.
2. `stand-flags`: `BRIDGE_ENABLED=true`, `BRIDGE_STATS_ENABLED=true`, `BRIDGE_INVENTORY_ENABLED=true`, `NODE_ENV=development` в `stand.env`, перезапуск api. Тоже вне этого среза. Для `/bridge/v1/*` нужен nginx location без входа стенда.
3. `register-dev-srv.sh --dry-run`, затем `--yes` (VDS): `bridge:register` (идемпотентно) и запись `KEY_ID`, `KEY`, `SITE_URL` в `/home/twomc/bridge-dev-srv.secret.env` (600). Ключ в вывод не попадает.
4. `link-account.sh --dry-run`, затем `--yes <ник>` (VDS): привязка тестового ника (офлайн-UUID) к админу стенда, иначе события будут `skipped_unlinked`.
5. Сборка JAR: `bash ../vds-runner/run-remote.sh java-build --worktree <worktree> --path plugins/bridge`; в сводке `tests=... failed=0`, sha256. Затем stage: `bash run-on-vds.sh stage <путь к TwoMCBridge-0.1.0.jar>` (панель не трогает).
6. `bash run-on-vds.sh install --dry-run`: только чтение (версия MC 1.21.4-1.21.11, Java 21, `online-mode`, отсутствие плагина, подписанный handshake). Блокеры (`BLOCKER:`) устранить, повторить.
7. `bash run-on-vds.sh install --yes`: `config.yml`, `bridge-key.txt`, JAR, restart, `/twomcbridge events`. Код 0: сайт принял события; 3: установлено, ждём игрока.
8. `bash run-on-vds.sh script bot-join.sh --check` (только GET: адрес и список `/plugins`), затем `bot-join.sh <ник> [секунды]`: mineflayer ставится внутри временного контейнера node:22-alpine; при AuthMe/nLogin бот шлёт `/register` и `/login` со случайным паролем (файл `/home/twomc/bridge-dev-bot.pass`, 600, не печатается). Код 3: нужен ручной вход владельца.
9. Проверка на стенде: `bash run-on-vds.sh script verify-bridge.sh` (код 0: события приняты), в админке стенда видны статистика и инвентарь тестового игрока.
10. `bash run-on-vds.sh script live-sigcheck.sh [--loopback] [--no-payments]`: случаи Bridge (4 дважды: 2xx затем 401; 1 без подписи; 2 мусорная; 3 ts на 120 с старше) и webhook `/api/webhooks/payments/test` (4 с несуществующим заказом, 1, 2, 3 с ts на 400 с старше: окно webhook 300 с). Печатает только «проверка | ожидалось | получено | PASS/FAIL».

### Формат подписи Bridge (сверен с `bridge-signature.guard.ts` и `Signer.java`)

`canonical = "twomc-bridge-v1" LF key-id LF timestamp LF nonce LF METHOD LF path LF sha256hex(сырое тело)`; `signature = hex(HMAC-SHA256(ключ_сервера, canonical))`. Заголовки: `x-twomc-key-id` (`<slug>.<поколение>`), `x-twomc-timestamp` (10 цифр, окно 60 с), `x-twomc-nonce` (base64url, 22-43 символа, одноразовый), `x-twomc-protocol: 1`, `x-twomc-signature` (64 hex), `Content-Type: application/json`. Webhook: `hex(HMAC-SHA256(PAYMENT_WEBHOOK_SECRET, "<ts>." + тело))`, заголовки `x-twomc-signature`, `x-twomc-timestamp`, окно 300 с, нонса нет.

## Откат (без удаления)

Откат: `bash run-on-vds.sh script rollback-bridge.sh --dry-run`, затем `--yes`: JAR переименовывается в `TwoMCBridge-0.1.0.jar.disabled-<время>`, сервер перезапускается. `config.yml` и `bridge-key.txt` остаются. Повторная установка поверх запрещена (скрипт остановится на шаге 2).

## При ошибке

- Код 255 у `run-on-vds.sh`: сбой SSH, не повторять подряд, подождать и проверить общий lock.
- Handshake: `503` - не включены BRIDGE_ENABLED или секрет; `401` - slug или ключ не зарегистрированы; `basic-auth-gate` - нет обхода входа стенда; `NETERR` - сеть или TLS.
- «Безопасный режим» инвентаря или плагин не отвечает на `/twomcbridge events`: смотреть консоль в панели, затем откат.
- Принятых событий 0 при игроке онлайн: аккаунт не привязан (`skipped_unlinked`), проверить UUID (офлайн-UUID) в `MinecraftAccount`.
- Ключ мог попасть в чат или лог: считать скомпрометированным, ротация по разделу 2.4 `docs/stage-03/BRIDGE-CONTRACT.md` (владелец).
