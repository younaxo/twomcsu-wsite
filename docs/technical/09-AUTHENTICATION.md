# 09 — Аутентификация

Код: `apps/api/src/modules/auth/` (`auth.controller.ts`, `auth.service.ts` 945 строк суммарно по модулю, `brute-force.service.ts`, `captcha.service.ts`, `refresh-cookie.ts`, `strategies/jwt.strategy.ts`, `guards/*`). Frontend: `apps/web/src/lib/api.ts`, `stores/authStore.ts`, `hooks/useAuth.ts`, `middleware.ts`.

## Модель
- **Access token**: JWT HS256, секрет `JWT_ACCESS_SECRET`, TTL `JWT_ACCESS_EXPIRES` (по умолчанию `15m`). Payload `AccessTokenPayload`: `sub`, `email`, `username`, `roleGroup`. Передаётся `Authorization: Bearer`. Хранится **только в памяти** frontend (`lib/api.ts`, переменная `accessToken`), в cookie/localStorage не пишется.
- **Refresh token**: 64 случайных байта (hex), в БД хранится **HMAC-SHA256 хеш** (`createHmac('sha256', JWT_REFRESH_SECRET)`), модель `RefreshToken` (`tokenHash`, `userId`, `expiresAt`, `revokedAt`, ip/user-agent). TTL `JWT_REFRESH_EXPIRES` (по умолчанию `30d`). Cookie `refresh_token`: `httpOnly`, `path=/`, `domain=COOKIE_DOMAIN` (default `localhost`), `secure=COOKIE_SECURE`, `sameSite=COOKIE_SAMESITE` (default `lax`).
- **Rotation**: каждый `POST /auth/refresh` ревокирует использованный токен и выпускает новую пару. Повторное использование ревокнутого токена → `revokeAllSessions(userId)` + 401 (reuse detection).
- **Пароли**: bcrypt, `BCRYPT_ROUNDS = 12`.

## Flows
| Flow | Endpoint | Особенности |
|---|---|---|
| Register | `POST /auth/register` | `RegisterDto`; email lower-case; проверка занятости email/username (+ обработка гонки по unique → 409); Cloudflare Turnstile |
| Login | `POST /auth/login` (`@Throttle` 10/мин) | `emailOrUsername` + `password`; см. brute-force ниже; бан → 403 `{ message, reason, bannedUntil }`; обновляет `lastLoginAt/lastLoginIp`; запускает проверки достижений |
| Refresh | `POST /auth/refresh` | читает cookie `refresh_token`; роль/данные берутся из БД заново |
| Logout | `POST /auth/logout` (**required**) | ревокает refresh-токен из cookie, чистит cookie |
| Список сессий | `GET /auth/sessions` (required) | активные `RefreshToken` пользователя |
| Logout all | `DELETE /auth/sessions` (required) | `AuthService.revokeAllSessions()` (`auth.controller.ts:147`) |
| Revoke one | `DELETE /auth/sessions/:id` (required) | ревокает одну сессию |
| Change password | `POST /auth/change-password` (required) | смена пароля авторизованным пользователем |
| Current user | `GET /auth/me` (required) | профиль; кеш `auth:me:{userId}` |
| Forgot password | `POST /auth/forgot-password` | молчит при неизвестном email; токен 32 байта, хеш в `PasswordResetToken`, TTL 1 ч, старые ссылки инвалидируются; **письмо не отправляется** (см. ниже) |
| Reset password | `POST /auth/reset-password` | Cloudflare Turnstile; одноразовый токен; обновляет пароль |

Всего в модуле `auth`: **11 endpoints** (5 без guard: register, login, refresh, forgot-password, reset-password). Подробности — в 04-API-REFERENCE.md (модуль `auth`).

## Brute-force (`BruteForceService`, Redis)
- Ключи: `bruteforce:login:{ip}` (счётчик, TTL 900 с), `bruteforce:blocked:{ip}` (блок, TTL 900 с).
- `CAPTCHA_AFTER_ATTEMPTS = 3`: после 3 неудач с IP ответ `{ requiresCaptcha: true }`, пока не передан `captchaToken`.
- `BLOCK_AFTER_ATTEMPTS = 10`: IP блокируется на 15 минут (HTTP 429). Успешный вход сбрасывает счётчики.
- Счётчик привязан к **IP**, не к аккаунту; IP берётся из `req.ip`, а `trust proxy` в `main.ts` не включён (за reverse proxy все клиенты окажутся с одним IP — см. 29-SECURITY.md).

## Captcha (`CaptchaService`)
Cloudflare Turnstile `https://challenges.cloudflare.com/turnstile/v0/siteverify` (ADR-0059), таймаут 5 с, `TURNSTILE_SECRET_KEY`; `TURNSTILE_DISABLED=true` только для CI e2e. Frontend ключ: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (dev — тестовый ключ Cloudflare).

## Статус аккаунта
- `User.isBanned` / `banReason` / `bannedUntil`: проверяется **только** в `login()` и при WS-подключении. `refresh()` и `JwtStrategy.validate()` **не** проверяют бан; бан (`AdminUsersService.bulk`, `QuickModerationService`) **не** вызывает `revokeAllSessions` → забаненный пользователь продолжает получать access-токены (см. 29-SECURITY.md, HIGH).
- `JwtStrategy.validate()` не обращается к БД: `roleGroup` берётся из токена → смена роли действует до истечения access-токена (≤ `JWT_ACCESS_EXPIRES`).
- `User.isVerified` — поле есть и отдаётся клиенту, но в `apps/api/src` **нигде не выставляется в `true`** и endpoint подтверждения email отсутствует → email verification **MISSING** (флаг фактически не используется).
- Disabled/soft-deleted аккаунтов в модели `User` нет.

## Guards / decorators
- `JwtAuthGuard` (учитывает `@Public()`), `OptionalJwtAuthGuard`, `RolesGuard` + `@Roles(RoleGroup.X)` ("X и выше"). `@CurrentUser()` достаёт `AuthenticatedUser` (`id`, `email`, `username`, `roleGroup`).
- Глобального auth-guard нет — защита включается на контроллерах (46 endpoints без guard перечислены в 05-API-MATRIX.md, колонка Auth = NONE).

## Frontend
- `lib/api.ts`: axios `withCredentials`, при 401 один общий `refreshAccessToken()` (дедупликация промиса) и повтор запроса; при провале — `sessionLostHandler` и редирект на `/login` (кроме запросов с `skipAuthRedirect`).
- `middleware.ts`: для `/profile`, `/admin`, `/dashboard`, `/moderation` редирект на `/login`, если нет cookie `refresh_token` (проверяется только наличие, не валидность).
- Maintenance mode: middleware опрашивает `GET /system/status` (кеш 30 с) и пускает в обход только `/admin`, `/dashboard`, `/moderation`, `/login`, `/register` и т.п.

## Статусы
| Функция | Статус |
|---|---|
| Register / Login / Refresh / Logout / Sessions | IMPLEMENTED |
| Refresh rotation + reuse detection | IMPLEMENTED |
| Brute-force + captcha | IMPLEMENTED (IP-based) |
| Password reset (токены, TTL) | PARTIAL — доставка письма не реализована (`auth.service.ts:261` TODO; в production ссылка не выводится нигде) |
| Email verification | MISSING |
| Бан → отзыв сессий | MISSING |
| `mustChangePassword`, `accountType=SYSTEM` | MISSING (нет полей в `User`) |
