# PHASE 03 — Local infrastructure

## Сделано

- `infrastructure/docker-compose.yml`: сервисы `postgres` (16-alpine) и `redis`
  (7-alpine), project name `twomc-su`, healthchecks, именованные volumes,
  изолированная сеть `twomc`. Postgres: `shared_buffers=256MB`,
  `max_connections=100`, явные `autovacuum_*` параметры (в старом проекте это
  было отложено как TODO, см. `docs/technical/42-TECH-DEBT.md`, LOW — здесь
  решено сразу, см. `README` в самом compose-файле/коммите).
- Корневые скрипты `pnpm db:up` / `pnpm db:down` (`docker compose --env-file .env
  -f infrastructure/docker-compose.yml ...`) — `--env-file` указан явно, так как
  иначе Docker Compose ищет `.env` рядом с compose-файлом (`infrastructure/.env`),
  а не в корне репозитория.

## Проверено по факту (не предполагалось)

Docker Desktop был не запущен — запущен, дождались готовности демона. Выполнено
`pnpm db:up`, затем реальная проверка статуса контейнеров:

```
twomc-su-postgres   Up ... (healthy)
twomc-su-redis      Up ... (healthy)
```

При первой попытке `redis` healthcheck падал (`WRONGPASS`) — healthcheck
(`redis-cli -a "$$REDIS_PASSWORD" ping`) обращался к переменной окружения внутри
контейнера, которой не было (пароль подставлялся только в `command:` на этапе
парсинга compose-файла). Исправлено добавлением `environment: REDIS_PASSWORD`
сервису `redis`. После исправления оба healthcheck — `healthy`.

## Важная находка (см. RISKS.md R11)

При первом запуске (project name `twomcsu`, как в старой документации) compose
обнаружил уже существующие volumes `twomcsu_postgres-data`/`twomcsu_redis-data`
(созданы 2026-07-27 — до начала этой сессии, похоже на данные предыдущей версии
проекта). Контейнеры были пересозданы поверх них (данные не удалялись), после
чего project name изменён на `twomc-su`, чтобы новый стек использовал отдельные,
чистые volumes. Старые volumes не удалены — решение оставлено владельцу
(см. `RISKS.md`, R11).

## Не входит в эту фазу

- Dockerfile для `apps/api`/`apps/web` — PHASE 35 (Production infrastructure).
- Подключение Prisma к `DATABASE_URL` — PHASE 04.
