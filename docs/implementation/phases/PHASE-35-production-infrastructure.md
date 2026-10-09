# PHASE 35 — Production infrastructure (Dockerfile, деплой, backup)

Фаза вынесена вперёд (после PHASE 21) по указанию владельца: деплой
twomc.su на уже предоставленный хостинг сразу после слияния admin-панели.

## Что есть в репозитории (`feature/production-infrastructure`)

- `infrastructure/api.Dockerfile` — multi-stage образ NestJS: pnpm 9.15.9
  (corepack), `--filter @twomc/api...`, сборка `@twomc/shared` + `nest build`,
  runtime без dev-зависимостей, non-root пользователь, healthcheck `/health`.
  Миграции при старте не выполняются.
- `infrastructure/web.Dockerfile` — Next.js `output: 'standalone'`;
  `NEXT_PUBLIC_*` передаются build-args (публичные значения).
- `infrastructure/docker-compose.prod.yml` — postgres + redis + api + web,
  образы с тегом `RELEASE` (git sha), порты приложений только на
  `127.0.0.1` (наружу — reverse proxy), volume `uploads` для `UPLOADS_DIR`.
- `infrastructure/deploy.sh` — деплой только из чистого `main`:
  build → `prisma migrate deploy` → переключение → health check → при
  неудаче автоматический `rollback` на предыдущий тег (`.release.prev`).
- `infrastructure/nginx.twomc.su.conf.example` — reverse proxy с TLS,
  security headers, WebSocket для `/socket.io`; `cdn-files.twomc.su`
  остаётся отдельным слоем.
- `.dockerignore`, `WEB_PORT` в `.env.example`, `apps/web/public/robots.txt`
  (закрывает `/admin` и `/design-lab` от индексации).

## Процедура деплоя на сервере

1. `git clone` / `git pull --ff-only` в директорию деплоя, ветка `main`.
2. `.env` по `.env.example` (production-значения, не в git):
   `DATABASE_URL=postgresql://…@postgres:5432/twomc`, `REDIS_HOST=redis`,
   `COOKIE_SECURE=true`, `COOKIE_DOMAIN=.twomc.su`, `WEB_ORIGIN`/
   `FRONTEND_URL`/`PUBLIC_SITE_URL=https://twomc.su`,
   `NEXT_PUBLIC_API_URL=https://api.twomc.su`, `TRUST_PROXY=true`,
   JWT-секреты, `HCAPTCHA_*`, `BOOTSTRAP_*` (PHASE 32).
3. `infrastructure/deploy.sh`.
4. Reverse proxy по примеру nginx (или адаптация существующего).
5. Health check: `https://twomc.su`, `/login`, `https://api.twomc.su/health`,
   `/auth/me` после входа, `/admin`, префиксы ролей с CDN, WebSocket,
   console/network без ошибок, логи `docker compose logs api web`.

## Backup / safety

- PostgreSQL volume `postgres-data` — `pg_dump` перед каждым деплоем с
  миграциями; `uploads` — rsync/снапшот; Redis — кеш (AOF включён).
- Откат: `infrastructure/deploy.sh rollback` (образы предыдущего релиза
  остаются локально).

## Статус

Артефакты готовы, образы собираются локально (проверка — при доступном
Docker daemon). **Фактический деплой заблокирован:** данных хостинга
(host/SSH/директория/прокси) в контексте проекта нет — RISKS.md R8.
