# Установка плагина TwoMC Bridge на dev-srv (Pterodactyl)

Назначение: поставить `TwoMCBridge-0.1.0.jar` на тестовый сервер dev-srv, чтобы проверить снимки статистики и инвентаря (выдача заказов выключена: `delivery.enabled: false`). Скрипты: `infrastructure/bridge-dev-srv/`. Все обращения к панели идут только с VDS и только к серверу из `SERVER_UUID`; запись закрыта `PTERO_ALLOW_WRITE=1` (его ставит только `--yes`).

## Где секреты (только пути, значения не читать и не печатать)

- `/home/twomc/pterodactyl-credentials.txt` (VDS, права 600): `PANEL_URL`, `SERVER_UUID`, `CLIENT_API_KEY`.
- `/home/twomc/bridge-dev-srv.secret.env` (VDS, права 600, создаёт Chief): `BRIDGE_SITE_URL`, `BRIDGE_SERVER_SLUG`, `BRIDGE_KEY_GEN`, `BRIDGE_KEY_HEX`. Ключ выводит владелец командой `bridge:print-key`, агент его не получает.
- На сервере ключ лежит в `plugins/TwoMCBridge/bridge-key.txt` (права 600); `config.yml` секретов не содержит.

## Предусловия на сайте стенда (выполняет владелец или Chief)

1. `BRIDGE_ENABLED=true`, `BRIDGE_MASTER_SECRET` (не менее 32 байт), `BRIDGE_STATS_ENABLED=true`, `BRIDGE_INVENTORY_ENABLED=true`.
2. Регистрация сервера: `pnpm --filter @twomc/api run bridge:register -- --slug dev-srv --name "Dev SRV" --capabilities player-events,inventory-sync` (на стенде NODE_ENV=development или флаги владельца, см. `bridge-server-registration.md`).
3. Ключ: `bridge:print-key -- --slug dev-srv --generation 1 --print-key` (владелец) и запись в `secret.env`.
4. Для `/bridge/v1/*` на стенде нужен обход входа стенда (иначе handshake вернёт `basic-auth-gate`).
5. Тестовый игрок: `MinecraftAccount.uuid` должен совпасть с UUID на сервере. На dev-srv `online-mode=false`, поэтому это офлайн-UUID: `infrastructure/bridge-dev-srv/offline-uuid.sh <ник>`.

## Порядок

Команды из каталога `infrastructure/bridge-dev-srv/`.

1. Сборка JAR: `bash infrastructure/vds-runner/run-remote.sh java-build --worktree <worktree> --path plugins/bridge`; в сводке: `tests=... failed=0`, sha256.
2. `bash run-on-vds.sh stage <путь к TwoMCBridge-0.1.0.jar>` (кладёт JAR и шаблон в `~/.twomc-inbox` на VDS; панель не трогает).
3. `bash run-on-vds.sh install --dry-run` - только чтение: версия MC (1.21.4-1.21.11), образ Java 21, `online-mode`, отсутствие плагина, подписанный handshake. Блокеры (`BLOCKER:`) устранить, повторить.
4. `bash run-on-vds.sh install --yes` - запись `config.yml`, `bridge-key.txt`, загрузка JAR, restart, проверка `/twomcbridge events`. Код 0: сайт принял события; 3: установлено, ждём игрока.
5. Зайти тестовым клиентом (ник тестового аккаунта), подождать до 5 минут, затем `bash run-on-vds.sh script verify-bridge.sh` (код 0: события приняты).

## Откат (без удаления)

`bash run-on-vds.sh script rollback-bridge.sh --dry-run`, затем `--yes`: JAR переименовывается в `TwoMCBridge-0.1.0.jar.disabled-<время>`, сервер перезапускается. `config.yml` и `bridge-key.txt` остаются. Повторная установка поверх запрещена (скрипт остановится на шаге 2).

## При ошибке

- Код 255 у `run-on-vds.sh`: сбой SSH, не повторять подряд, подождать и проверить общий lock.
- Handshake: `503` - не включены BRIDGE_ENABLED или секрет; `401` - slug или ключ не зарегистрированы; `basic-auth-gate` - нет обхода входа стенда; `NETERR` - сеть или TLS.
- «Безопасный режим» инвентаря или плагин не отвечает на `/twomcbridge events`: смотреть консоль в панели, затем откат.
- Принятых событий 0 при игроке онлайн: аккаунт не привязан (`skipped_unlinked`), проверить UUID (офлайн-UUID) в `MinecraftAccount`.
- Ключ мог попасть в чат или лог: считать скомпрометированным, ротация по разделу 2.4 `docs/stage-03/BRIDGE-CONTRACT.md` (владелец).
