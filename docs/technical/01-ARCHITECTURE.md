# 01 — Архитектура (фактическая)

## Схема
```text
Browser
  │  HTTPS (axios, withCredentials, Bearer access-token из памяти)   Socket.IO (auth.token)
  ▼                                                                    │
Next.js 14 (apps/web, :3000) ── middleware.ts: locale, cookie-gate, maintenance (GET /system/status, кеш 30 с)
  │ NEXT_PUBLIC_API_URL (прямые вызовы браузера, без rewrite/proxy)    │
  ▼                                                                    ▼
NestJS API (apps/api, :4000) ── helmet, cookie-parser, CORS(WEB_ORIGIN), ValidationPipe, ThrottlerGuard(100/60с), LastActivityInterceptor
  │ Controllers (73) → Guards (JwtAuth/OptionalJwt/Roles) → Services → PrismaService / CacheService / RedisService
  │ Gateways (3): /chat, /messages, /notifications
  ▼
PostgreSQL 16 (105 моделей)   Redis 7 (cache, bruteforce, presence)   Local disk /uploads   External: hCaptcha, SMTP, Web Push, Twitch/YouTube, Minecraft servers
```
CDN как отдельный сервис **не используется** (цель: `cdn-files.twomc.su`, см. 26-CDN-FILES.md).

## Потоки
- **Запрос:** браузер → axios (`lib/api.ts`, добавляет `Authorization`) → контроллер → `JwtAuthGuard` (проверка подписи JWT, БД не читается) → `RolesGuard` → сервис → Prisma → ответ. Throttler 100 req/60 с глобально.
- **401:** interceptor вызывает `POST /auth/refresh` (cookie), повторяет запрос, при провале — `/login`.
- **Авторизация:** только `roleGroup` из JWT; проверки владения/иерархии — в сервисах.
- **Кеш:** сервис читает `CacheService` (ключи `cacheKeys.*`, TTL `CACHE_TTL.*`), при записи вручную чистит ключи/паттерны.
- **Realtime:** сервис → gateway `emit` в комнату → клиент (`useSocket`, `useChat`, `useDirectMessagesSocket`, `useNotificationSocket`) → обновление Zustand (`chatStore`) / инвалидация React Query (`lib/query-keys.ts`).
- **Файлы:** multipart → Multer (память) → sharp → диск `UPLOADS_DIR` → путь `/uploads/...` в БД → отдача Express-static.
- **Фон:** `@nestjs/schedule` (12 cron) внутри процесса API.

## Frontend (кратко; подробности — 02-FRONTEND.md, не написан)
Next.js 14 App Router, сегмент `[locale]` (next-intl, сообщения в `apps/web/messages`), группа `(auth)`, layouts: корневой, `[locale]`, `(auth)`, `admin` (ADMIN), `dashboard` (OWNER), `moderation`; `error.tsx`, `loading.tsx`, `not-found.tsx`. Хуки в `src/hooks` (28 + подпапки `admin`, `store`, `forms`, `news`, `reports`, `servers`, `achievements`, `activity`, `markdown`), сторы Zustand: `authStore`, `chatStore`, `storeUiStore`; TanStack Query (`lib/query-client.ts`).
