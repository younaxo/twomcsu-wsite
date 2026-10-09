# 32 — Переменные окружения

Единый `.env` в корне монорепо (`.env.example`). API читает его через `dotenv -e ../../.env` (скрипты `db:*`) и `ConfigModule`; `apps/web/next.config.mjs` подгружает тот же файл. Маппинг в `apps/api/src/config/configuration.ts`. Валидации env-схемой при старте **нет** (значения по умолчанию заданы в коде).

| Variable | App | Required | Secret | Example | Description |
|---|---|---|---|---|---|
| `NODE_ENV` | api, seed | yes (prod) | no | `production` | режим; влияет на логи, seed, вывод reset-ссылки |
| `API_PORT` | api | no (4000) | no | `4000` | порт API |
| `WEB_ORIGIN` | api | prod | no | `https://twomc.su` | CORS origin (default `http://localhost:3000`) |
| `FRONTEND_URL` | api | prod | no | `https://twomc.su` | база ссылок в письмах |
| `PUBLIC_SITE_URL` | api | no | no | `https://twomc.su` | базовый URL для RSS (`news.controller.ts:96`), default `https://twomc.su` |
| `DATABASE_URL` | api (prisma) | yes | **yes** | `postgresql://<USER>:<SECRET>@host:5433/db` | подключение Prisma |
| `POSTGRES_USER/PASSWORD/DB/PORT` | docker-compose | no (defaults) | PASSWORD yes | — | контейнер Postgres; default порта 5433 |
| `PRISMA_DEBUG` | api | no | no | `false` | логировать SQL |
| `REDIS_HOST/PORT` | api | no (localhost:6379) | no | — | Redis |
| `REDIS_PASSWORD` | api, compose | prod | **yes** | `<SECRET>` | пароль Redis (compose-default `redis_dev_password`) |
| `JWT_ACCESS_SECRET` | api | yes | **yes** | `<SECRET>` | HS256 access (default `''`) |
| `JWT_REFRESH_SECRET` | api | yes | **yes** | `<SECRET>` | HMAC refresh-хешей |
| `JWT_ACCESS_EXPIRES` | api | no (`15m`) | no | `15m` | TTL access |
| `JWT_REFRESH_EXPIRES` | api | no (`30d`) | no | `30d` | TTL refresh |
| `TURNSTILE_SECRET_KEY` | api | prod | **yes** | `<SECRET>` | Cloudflare Turnstile secret (dev — тестовый `1x0000000000000000000000000000000AA`) |
| `TURNSTILE_DISABLED` | api | no | no | `false` | отключает проверку — только CI e2e |
| `COOKIE_DOMAIN` | api | prod | no | `.twomc.su` | default `localhost` |
| `COOKIE_SECURE` | api | prod | no | `true` | default false |
| `COOKIE_SAMESITE` | api | no (`lax`) | no | `lax` | `lax/strict/none` |
| `UPLOADS_DIR` | api | no (`./uploads`) | no | `/data/uploads` | локальное хранилище файлов |
| `UPLOAD_MAX_AVATAR_SIZE` | api | no (5 MiB) | no | `5242880` | байты |
| `UPLOAD_MAX_BANNER_SIZE` | api | no (10 MiB) | no | `10485760` | байты |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | api | optional | SECRET yes | — | streaming |
| `YOUTUBE_API_KEY` | api | optional | **yes** | `<SECRET>` | streaming |
| `SMTP_HOST/PORT(587)/SECURE/USER/PASSWORD` | api | optional | PASSWORD yes | — | `EmailService`; без `SMTP_HOST` почта выключена |
| `SMTP_FROM_NAME` (`TwoMC`), `SMTP_FROM_EMAIL` (`noreply@twomc.su`) | api | optional | no | — | отправитель |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | api | optional | PRIVATE yes | — | Web Push (`PushService`) |
| `SEED_OWNER_EMAIL/USERNAME/PASSWORD` | seed | yes для seed | PASSWORD yes | — | owner-аккаунт seed (без них seed падает) |
| `NEXT_PUBLIC_API_URL` | web | yes | no | `https://api.twomc.su` | базовый URL API (default `http://localhost:4000`); также в middleware |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | web | prod | **yes** | — | публичный ключ Turnstile (dev — `1x00000000000000000000AA`) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | web | optional | no | — | подписка на push |
| `ANALYZE` | web build | no | no | `true` | bundle analyzer |

## Окружения
- **dev**: `.env` из `.env.example`, `docker compose up postgres redis`, тестовые ключи Turnstile из `.env.example`.
- **test**: тестового окружения и тестов в репозитории нет (46-TESTING.md).
- **staging/production**: окружения в репозитории не описаны; обязательны secrets (`JWT_*`, `DATABASE_URL`, `REDIS_PASSWORD`, `TURNSTILE_SECRET_KEY`, SMTP), `COOKIE_DOMAIN/SECURE`, `WEB_ORIGIN`, `FRONTEND_URL`; не запускать seed без новых `BOOTSTRAP_*` (S1).
## Новые переменные (PROPOSED)
`CDN_BASE_URL`, `STORAGE_DRIVER`, `STORAGE_BUCKET/ENDPOINT/ACCESS_KEY/SECRET_KEY`, `BOOTSTRAP_SYSTEM_PASSWORD`, `BOOTSTRAP_OWNER_PASSWORD`, `BOOTSTRAP_CHIEF_CURATOR_PASSWORD`, `PAYMENTS_MOCK_ENABLED`, `TRUST_PROXY`.
