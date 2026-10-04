# 29 — Security review (анализ кода)

Метод: чтение кода репозитория, без внешнего pentest. Секреты в документ не включены (`<SECRET>`). Каждая находка проверена по исходнику.

## Сводка
| # | Severity | Находка |
|---|---|---|
| S1 | CRITICAL | Seed создаёт OWNER-аккаунты с захардкоженным паролем в production |
| S2 | CRITICAL | `mock-complete` позволяет «оплатить» заказ без денег |
| S3 | HIGH | Бан не блокирует `refresh` и не отзывает сессии |
| S4 | HIGH | Сброс пароля не доставляется в production |
| S5 | HIGH | Массовый бан без проверки иерархии |
| S6 | MEDIUM | `trust proxy` не включён: brute-force/throttler за reverse proxy считают всех одним IP |
| S7 | MEDIUM | Роль берётся из JWT (устаревание ≤ TTL access-токена) |
| S8 | MEDIUM | Аудит покрывает 21 вызов из 186 staff-мутаций; ошибки записи аудита глотаются |
| S9 | MEDIUM | Тип файла определяется по клиентскому `mimetype` (кроме проверки декодирования `sharp` и PDF magic) |
| S10 | MEDIUM | Throttler использует in-memory storage; лимиты не общие между инстансами; `@Throttle` задан лишь на 13 endpoints, остальные — глобальные 100/60 с |
| S11 | LOW | WS `/messages`: `cors.origin = true` |
| S12 | LOW | WS `/chat`: `join_channel` без проверки канала; `ban_user`/`mute_user` рассылают событие (с причиной) всем сокетам namespace |
| S13 | LOW | Префиксная проверка пути при удалении файла (`startsWith(rootDir)` без разделителя) |
| S14 | LOW | `news/[slug]/page.tsx`: JSON-LD через `JSON.stringify` в `<script>` без экранирования `<` (контент задаёт ADMIN) |
| S15 | LOW | Postgres/Redis публикуются на хост (`5433`, `6379`) с dev-паролями по умолчанию в `docker-compose.yml` |
| S16 | LOW | Пустые значения `JWT_*_SECRET` по умолчанию (`''`), валидации env при старте нет |

## Детали
### S1 — Hardcoded bootstrap passwords (CRITICAL)
Location: `apps/api/prisma/seed.ts` ~1117–1136 (`ensureReservedShortId` для `#1`, `#2`; пароль — литерал в коде). Проверка `NODE_ENV === 'production'` стоит **после** этих вызовов (~1138).
Risk: `pnpm db:seed` в production создаёт/переназначает OWNER-аккаунты с известным паролем, значение лежит в git.
Fix: брать пароли только из ENV (`BOOTSTRAP_*_PASSWORD`), при отсутствии — не создавать аккаунты и падать с ошибкой; `mustChangePassword`; сменить уже скомпрометированные пароли.
### S2 — mock-complete (CRITICAL)
Location: `store/orders.controller.ts:80`, `OrdersService.mockComplete` (`orders.service.ts:349`). Проверяется лишь владелец заказа и `status = PENDING`; нет проверки окружения. Эффект: `COMPLETED`, `paidAt`, `promoCodeUsage`, выдача `UserDecoration`, уведомления. Фронт использует `useSimulatePayment` на `/store/mock-payment`.
Fix: удалить/закрыть флагом `PAYMENTS_MOCK_ENABLED` (только non-prod) до подключения реального шлюза; завершать заказ только вебхуком провайдера с проверкой подписи. Также `POST /store/quick-buy` (гость, без auth) создаёт `PENDING`-заказы без rate-limit кроме глобального → спам заказов.
### S3 — Ban bypass (HIGH)
`AuthService.refresh()` и `JwtStrategy.validate()` не читают `isBanned`; `AdminUsersService.bulk` (`admin-users.service.ts:289`) и `QuickModerationService` (~190) не вызывают `revokeAllSessions`. Fix: при бане — `revokeAllSessions(userId)` + проверка бана в `refresh()` и в guard.
### S4 — Reset email (HIGH)
`auth.service.ts:261`: TODO, ссылка пишется в лог только при `NODE_ENV !== 'production'`. `EmailService` (SMTP) существует в `notifications/` — использовать его.
### S5 — Hierarchy in bulk ban (HIGH)
`AdminUsersService.bulk`: единственная проверка — `userIds.includes(actorId)`. Fix: централизованная проверка priority актёра против каждой цели (10-RBAC-PERMISSIONS.md, B.4).
### Проверено и признано безопасным
- SQL: все `$queryRaw` — tagged templates (параметризованы), 6 мест (`admin-tools`, `statistics`, `health`).
- Mass assignment: `ValidationPipe({ whitelist, forbidNonWhitelisted })` отсекает лишние поля.
- XSS: HTML пользовательского контента строится на сервере `MarkdownService` через `sanitize-html` (allowlist тегов, схемы `http/https/mailto`); на фронте `dangerouslySetInnerHTML` получает уже очищенное `*Html`. Замечание: `img src` разрешён для любых http(s) URL (трекинг-пиксели, LOW).
- SSRF: `LinkPreviewService` (46 строк) только извлекает URL регуляркой и **не выполняет запросов**; SSRF отсутствует. Исходящие запросы: hCaptcha, Twitch/YouTube, SMTP, Minecraft ping (адреса задаёт ADMIN).
- Voting webhook: секрет в `x-vote-secret`, хранится хеш, сравнение `timingSafeEqual`.
- Refresh-токены: хранятся как HMAC-хеш, rotation + reuse detection; cookie `httpOnly`.
- CSRF: refresh-cookie `sameSite=lax` по умолчанию, access-токен в заголовке; при `COOKIE_SAMESITE=none` нужен CSRF-токен на `/auth/refresh`.
- CORS API: единственный origin `WEB_ORIGIN` + credentials.
### Не проверялось
Миграции на предмет данных, зависимости на уязвимости (`pnpm audit`), конфигурация reverse proxy, права на `uploads/`.
