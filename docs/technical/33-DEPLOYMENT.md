# 33 — Deployment / инфраструктура

## Что есть в репозитории
`docker-compose.yml` (project `twomcsu`) содержит **только** два сервиса:
| Service | Image | Ports (host:container) | Volume | Healthcheck |
|---|---|---|---|---|
| `postgres` (`twomc-postgres`) | `postgres:16-alpine` | `${POSTGRES_PORT:-5433}:5432` | `postgres-data` | `pg_isready`, 10 с / 5 retries |
| `redis` (`twomc-redis`) | `redis:7-alpine` | `${REDIS_PORT:-6379}:6379` | `redis-data` | `redis-cli ping` |
Сеть `twomc` (bridge). Postgres настроен (`shared_buffers=256MB`, `max_connections=100`, TODO про autovacuum). Redis: `--requirepass`, `--appendonly yes` (персистентность AOF).
**Dockerfile для `apps/api` и `apps/web` отсутствуют, CI (`.github`) отсутствует** — контейнеризации приложений нет; статус `MISSING`.
Defaults паролей в compose (`minecraft`, `redis_dev_password`) — только для dev.

## Порядок запуска (dev)
1. `pnpm install` (postinstall: `prisma generate`).
2. `pnpm db:up` (Postgres+Redis).
3. `pnpm db:migrate` (`prisma migrate dev`, 41 миграция).
4. `pnpm db:seed` (`prisma db seed`).
5. `pnpm dev` — сборка `@twomc/shared`, затем параллельно `nest start --watch` (API :4000) и Next.js dev (:3000).
## Production (по скриптам)
`pnpm build` (`pnpm -r build`) → `prisma migrate deploy` (`pnpm --filter @twomc/api db:deploy`) → `node dist/main.js` (API) и `next start` (web). Seed в production запускать нельзя до исправления S1.
## Зависимости между сервисами
Web → API (HTTP + Socket.IO на `NEXT_PUBLIC_API_URL`); API → PostgreSQL (обязателен), Redis (обязателен: brute-force, кеш, presence), SMTP/VAPID/Twitch/YouTube/hCaptcha (опционально/внешние), Minecraft-серверы (TCP ping). Health: `GET /health` (проверка БД `SELECT 1`). Статус системы: `GET /system/status` (опрашивается middleware web для maintenance).
## Сеть и прокси
Нужен reverse proxy с TLS и поддержкой WebSocket (`/socket.io`); в API включить `trust proxy` (S6). Статика `/uploads` отдаётся самим API (до внедрения CDN `cdn-files.twomc.su`).
## Backup
PostgreSQL (обязательно), каталог `UPLOADS_DIR`/CDN-бакет (обязательно), Redis — по сути кеш (AOF включён, но критичного состояния нет: brute-force-счётчики и presence временные), secrets/`.env` — в менеджере секретов.
