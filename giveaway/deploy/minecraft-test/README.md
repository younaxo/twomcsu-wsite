# Тестовый Minecraft-сервер на VDS (проверка плагина розыгрыша)

Цель: проверить `giveaway/plugin` на Minecraft 1.21.4 и 1.21.11 (вход, выход, подсчёт, AFK, обрыв связи, перезапуск; таблица - `../POST-DEPLOY-CHECKLIST.md`, раздел D). Это тестовый сервер, не игровой production. Игровой трафик Minecraft через Cloudflare не проксировать (Q14): игроки подключаются напрямую по IP:порт.

## Выбор сервера
Paper через образ `itzg/minecraft-server:java21` (готовая сборка скачивается за ~1 минуту, Java 21, лёгкий). Плагин собирается против Spigot API (`compileOnly`), Paper его реализует, поэтому проверка корректна для Bukkit-совместимых серверов. Настоящий Spigot через BuildTools (`MC_TYPE=SPIGOT`) компилируется 10+ минут и требует больше памяти, чем лимит 1.5 ГБ: использовать только разово, остановив остальной стек, либо собрать jar Spigot на машине агента и подложить его. Образ перед использованием закрепить по digest (как в RUNBOOK п.4).

Ограничения: память контейнера 1.5 ГБ (JVM 1 ГБ), 5 игроков, view-distance 6; `online-mode=true` (`ONLINE_MODE=TRUE`), RCON и query выключены, `cap_drop: ALL`, `no-new-privileges`. Порт по умолчанию привязан к `127.0.0.1` (Docker обходит ufw), наружу - только по шагам ниже.

## Шаги
1. Собрать плагин на машине агента: `giveaway/plugin` (`gradlew build`), jar лежит в `giveaway/plugin/build/libs/`. Загрузить: `ssh gw@<ip> mkdir -p /srv/twomc-giveaway/mc/plugins`, затем `scp -i <ключ-агента> giveaway/plugin/build/libs/<jar> gw@<ip>:/srv/twomc-giveaway/mc/plugins/`.
2. Эта папка лежит на сервере внутри релиза: `/srv/twomc-giveaway/releases/<sha>/giveaway/deploy/minecraft-test/` (кладёт `deploy.sh`).
3. `cp mc.env.example /srv/twomc-giveaway/mc/mc.env`, поставить `MC_EULA=TRUE` (принятие EULA Mojang, https://aka.ms/MinecraftEULA - осознанное действие оператора; без этого скрипт не запустится).
4. Ключ сервера `mc-test`: `./mc-test.sh keygen` (печатает key-id и путь; `mc-test` уже в `GIVEAWAY_ALLOWED_SERVERS`).
5. Запуск 1.21.4: `./mc-test.sh up 1.21.4`. Каждая версия - свой каталог данных (`data-1.21.4`, `data-1.21.11`): мир с 1.21.11 нельзя открыть в 1.21.4. Статус: `./mc-test.sh status`, логи: `./mc-test.sh logs 100`, память: `./mc-test.sh memory` (вместе с api/postgres/redis должно укладываться в ОЗУ VDS).
6. Подключение игрока из интернета (на время теста): `sudo bash ../../setup-server.sh mc-port-open 25565` и `./mc-test.sh up 1.21.4 --public` (привязка `0.0.0.0`). Игрок: лицензионный клиент нужной версии, адрес `<ip>:25565`. Плагин внутри сервера ходит на `https://giveaway.twomc.su` через шлюз Docker (`extra_hosts`), DNS для этого не нужен.
7. Смена версии: `./mc-test.sh up 1.21.11 [--public]` (прежний контейнер останавливается автоматически).
8. Конец теста: `./mc-test.sh down`, `sudo bash ../../setup-server.sh mc-port-close 25565`; с другой машины `nmap -Pn <ip>` - 25565 закрыт.

## Заметки
- Плагин берёт `apiUrl`, `serverId`, `keyVersion`, `keyFile` из окружения (`GIVEAWAY_API_URL`, `GIVEAWAY_SERVER_ID`, `GIVEAWAY_KEY_VERSION`, `GIVEAWAY_KEY_FILE`): см. `docker-compose.yml`; ключ монтируется read-only из `/srv/twomc-giveaway/keys`. Контейнер работает под uid/gid пользователя `gw` (скрипт задаёт `MC_UID`/`MC_GID`), поэтому файл ключа 0600 ему доступен.
- Для проверки AFK можно временно задать `afkMinutes: 1` в `config.yml` плагина внутри `data-<версия>/plugins/` (после первого запуска) и перезапустить.
- Данные теста пишутся в БД мини-выкладки под serverId `mc-test` (RUNBOOK п.9).
- Проверка compose без демона: `MC_EULA=TRUE MC_VERSION=1.21.4 docker compose -f docker-compose.yml config -q`.
