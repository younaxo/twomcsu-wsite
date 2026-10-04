# PHASE 05 — Authentication

## Сделано

- `modules/redis` (`RedisService`/`RedisModule`, глобальный, ioredis) и
  `modules/email` (`EmailService`/`EmailModule`, глобальный, nodemailer;
  без `SMTP_HOST` — логирует и не падает, см. ADR/RISKS R4) — вытянуты в
  эту фазу раньше их формальных номеров (PHASE 24/12), так как Auth реально
  зависит от Redis (brute-force) и email (сброс пароля) уже сейчас.
- `modules/auth`: `AuthController`/`AuthService`, `JwtStrategy` (`passport-jwt`),
  `JwtAuthGuard`/`OptionalJwtAuthGuard`, `@Public()`/`@CurrentUser()`,
  `BruteForceService` (Redis, IP-based: captcha после 3 неудач, блок на 900 с
  после 10), `CaptchaService` (hCaptcha, `fetch`, timeout 5 с,
  `HCAPTCHA_DISABLED`).
- Endpoints (`/auth/*`): `register`, `login`, `refresh`, `logout`, `sessions`
  (`GET`/`DELETE`/`DELETE :id`), `change-password`, `me`, `forgot-password`,
  `reset-password` — согласно `docs/technical/09-AUTHENTICATION.md`.
- **Отличия от старого проекта (по ADR-0004 / 44-TARGET-ARCHITECTURE.md):**
  JWT access-token содержит только `{ sub }` (не `email/username/roleGroup`).
  `JwtStrategy.validate()` обращается к БД на каждый запрос и проверяет
  `isBanned` → фиксит S3 (29-SECURITY.md: в старом проекте бан не блокировал
  `refresh`/guard); то же самое проверяет `refresh()`. Кеширование через Redis
  (`perm:user:{id}`) — PHASE 06, пока прямой запрос к БД (корректность важнее
  производительности на этом этапе).
- Refresh-токен: 64 случайных байта, HMAC-SHA256(`JWT_REFRESH_SECRET`) хеш в
  `RefreshToken.tokenHash`, rotation на каждый `refresh`, reuse detection →
  `revokeAllSessions`. Password-reset токен: 32 байта, SHA-256 хеш, TTL 1 час,
  старые неиспользованные токены пользователя удаляются при новом запросе.
  Сброс пароля дополнительно отзывает **все** сессии (новое по сравнению со
  старым проектом — обоснованно: сброс пароля = подозрение на компрометацию).
- `main.ts` → `src/configure-app.ts` (`configureApp()`): helmet, cookie-parser,
  CORS (`WEB_ORIGIN`, credentials), глобальный `ValidationPipe`
  (`whitelist`/`forbidNonWhitelisted`/`transform`). `ThrottlerModule` глобально
  100/60с + `@Throttle` 10/мин на `/auth/login`.
- `env.validation.ts` расширен: `JWT_*`, `REDIS_*`, `WEB_ORIGIN`,
  `FRONTEND_URL`, `COOKIE_*`, `HCAPTCHA_*` (условно обязателен, если не
  `HCAPTCHA_DISABLED`), `SMTP_*`.
- CI (`ci.yml`): добавлен сервис-контейнер `redis`, `JWT_ACCESS_SECRET`/
  `JWT_REFRESH_SECRET`/`HCAPTCHA_DISABLED` в `env:` джоба `quality` (без них
  `ConfigModule` падает на старте — приложение теперь требовательнее к env).

## Реальные баги, найденные тестами (важно для будущих фаз)

1. **e2e-тесты не прогоняли `main.ts`.** `Test.createTestingModule(...).createNestApplication()`
   не вызывает `bootstrap()` из `main.ts` — значит `helmet`/`cookie-parser`/
   `ValidationPipe`/CORS не применялись вообще ни в одном e2e-тесте, включая
   уже существовавшие `app.e2e-spec.ts`/`health.e2e-spec.ts` из предыдущих фаз.
   Из-за этого `refresh` в тестах получал `undefined` вместо refresh-cookie.
   **Исправлено** вынесением общей настройки в `configure-app.ts`, используется
   и в `main.ts`, и в каждом e2e-тесте. Это системная ловушка — при добавлении
   нового global pipe/middleware в `main.ts` его нужно добавлять именно в
   `configureApp()`, а не напрямую в `bootstrap()`.
2. **`COOKIE_DOMAIN=localhost` не работает с `127.0.0.1`.** Браузер/cookie-jar
   не отправляет cookie с explicit `Domain=localhost` на запросы к `127.0.0.1`
   (strict domain matching). Нашлось через e2e-тест refresh-rotation (agent
   не получал cookie обратно). Исправлено: при `COOKIE_DOMAIN=localhost`
   (дефолт для dev/test) атрибут `Domain` не выставляется вовсе — браузер
   определяет его сам по хосту запроса; в production `COOKIE_DOMAIN`
   (например `.twomc.su`) используется как есть.
3. **HTTP-статусы `login`/`refresh`/`change-password`/`forgot-password`/
   `reset-password`** по умолчанию были 201 (Nest default для `@Post()`) —
   переведены на явный 200 (`@HttpCode(HttpStatus.OK)`), 201 остаётся только
   у `register` (создаёт нового пользователя).
4. **Blocked-by-brute-force** был `403 Forbidden`, хотя
   `09-AUTHENTICATION.md` явно фиксирует `HTTP 429` для этого случая —
   исправлено на `HttpException(..., HttpStatus.TOO_MANY_REQUESTS)`.
5. **Утечка хендлов в `app.e2e-spec.ts`** (шаблон NestJS CLI): `beforeEach`
   создавал новое приложение на каждый тест, но нигде не закрывал предыдущее —
   с живыми Redis/Prisma-соединениями это стало ловить jest
   (`A worker process has failed to exit gracefully`). Добавлен `afterEach →
   app.close()`.

## Проверено реальным запуском

`apps/api/test/auth.e2e-spec.ts` — **10 тестов**, все против реального
Postgres+Redis (`docker-compose`, см. PHASE 03):

- register (успех, дубликат email → 409);
- login (неверный пароль → 401, без токена `/me` → 401);
- полный цикл login → me → refresh (rotation, новый cookie) → **reuse
  detection** (повторное использование старого refresh-cookie → 401 **и**
  текущая на тот момент сессия тоже отзывается) → logout;
- forgot-password → reset-password (письмо перехвачено подменой
  `EmailService.send`, токен вытащен из тела письма реальным regex) → вход с
  новым паролем → повторное использование токена → 401;
- **бан отзывает уже выданный access/refresh немедленно** (fix S3);
- **brute-force**: 10 неудачных попыток → 11-я (даже с верным паролем) → 429.

Полный набор из корня: `pnpm lint && pnpm format:check && pnpm typecheck &&
pnpm build && pnpm test && pnpm test:e2e` — все зелёные.

## Не входит в эту фазу

- RBAC/permissions (`@RequirePermissions`, Redis-кеш `perm:user:{id}`) —
  PHASE 06. Пока нет staff-эндпоинтов, которые могли бы ими пользоваться.
- Email verification (`User.isVerified`) — не было в задании явно, остаётся
  `MISSING` как и в старом проекте (см. `COVERAGE.md`), не блокирует Auth.
- Полноценный `modules/redis`/`modules/email` (централизованные cache keys,
  шаблоны писем, digest) — функциональность, достаточная для Auth, уже есть;
  расширение — PHASE 12 (Notifications) и PHASE 24 (Redis/cache).
