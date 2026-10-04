# 43 — Отсутствующая / неполная функциональность

Метод: сопоставление схемы БД, API (497 endpoints), страниц (143) и TODO. Системное сравнение «страница↔endpoint» (frontend→API map) **не завершено** (37-FRONTEND-API-MAP.md не написан), поэтому раздел покрывает проверенные случаи.

| Ситуация | Статус | Детали |
|---|---|---|
| Таблица есть, сервиса нет | UNUSED | `ChatMessageReaction` |
| Таблица есть, интеграции нет | STUB | `GameReport`, `GamePunishment` (TigerReports/LiteBans) |
| Страница есть, backend нет | STUB | `/wiki`, `/support/faq`, `/reports` |
| Оплата | MISSING | реального шлюза нет; только mock (`paymentUrl=/store/mock-payment`) |
| Email: сброс пароля | MISSING | `EmailService` есть, но не вызывается из `forgotPassword` |
| Email verification | MISSING | `User.isVerified` нигде не выставляется в `true` |
| Бан → отзыв сессий | MISSING | S3 |
| Permissions / роли как данные | MISSING | 10-RBAC-PERMISSIONS.md |
| Audit для staff-мутаций | PARTIAL | 21 / 186 |
| CDN (`cdn-files.twomc.su`) | MISSING | локальный диск `/uploads` |
| AVIF | MISSING | WebP q90 |
| Модель файлов (owner/orphans) | MISSING | 26-CDN-FILES.md |
| Системный аккаунт `#0`, `accountType`, `mustChangePassword` | MISSING | нет полей в `User` |
| Bootstrap из ENV для `#1/#2` | MISSING | пароли в seed hardcoded |
| Battle Pass | PLANNED | только `BATTLEPASS_TODO.md` |
| Marketplace/аукцион, верификация MC-ника | PLANNED | `lib/todos.ts` |
| Тесты, CI, Dockerfile api/web | MISSING | — |
| Единый формат ошибок / requestId | MISSING | стандартный Nest-формат |
| WS rate limiting | MISSING | только `AntiSpamService` для сообщений чата |
Дополнительно: страница `/store/mock-payment` существует и вызывает `POST /store/orders/:orderId/mock-complete` (хук `useSimulatePayment`).
