# Подэтап 0.5 — API оформления заказа (2026-11-18)

Ветка `feature/l0-05-checkout-api`. Источник ТЗ: `docs/plan/PRIORITY-PLAN-DRAFT.md`, раздел «0.5».

## Что сделано

- `POST /store/orders` и `POST /store/quick-buy`: обязательный акцепт оферты. Клиент присылает `offerVersion`; нет версии — 400 `offer_not_accepted`, не текущая — 400 `offer_version_mismatch`. Версия и время акцепта сохраняются в заказе (`offerVersion`, `offerAcceptedAt`).
- Текущая версия оферты — настройка сайта `store.offerVersion`, по умолчанию `1`.
- Ник получателя: вошедшему без явного ника берётся привязанный ник; `NickResolver` проверяет только источники, известные сайту (привязанные Minecraft-аккаунты, регистр не важен, сохраняется каноническое написание). Неизвестный ник — единый 400 `nick_unavailable` без причины; нет ника вообще — 400 `nick_required`.
- Анонимный quick-buy под `QUICK_BUY_ENABLED` (Joi: dev/test — true, production и пустой/неизвестный `NODE_ENV` — false). Выключен — 403 `quick_buy_disabled`. Лимит 10/мин сохранён.
- `GET /store/checkout-config` (публично, без секретов): версия оферты, `paymentAvailable`, `quickBuyEnabled`.
- `GET /store/orders/:orderNumber` для владельца уже существовал; проверено e2e (владелец читает, чужой — 403).
- Нет `PAYMENT_PROVIDER` — 503 `payment_unavailable` до любой записи; сбой `createPayment` переводит созданный заказ в FAILED и тоже даёт 503 (висячих PENDING нет).
- Вебхук: подпись, идемпотентность, сверка суммы и валюты уже были в `handleWebhook`; добавлены e2e (неверная подпись 401, расхождение суммы/валюты, повтор).

## Проверки

- Юнит: `jest src/modules/store src/config` — 16 наборов, 281/281 тестов.
- E2E (одноразовая БД, `e2e-guarded.sh`, лог `scratchpad/e2e-l005-1/summary.txt`): store-checkout 19/19, store-checkout-offer 13/13, store-checkout-unavailable 4/4, store-cart 38/38. Итого 74/74.
- `pnpm --filter api typecheck`: падает ТОЛЬКО на `src/modules/audit/audit.service.spec.ts` (`logInTx` отсутствует в `AuditService`) — файл не тронут этим подэтапом, в этой ветке нет соответствующей правки сервиса (приходит в другой ветке стека). В файлах 0.5 ошибок нет.
- eslint по затронутым папкам: единственная ошибка prettier — в `promocodes-admin.controller.ts`, файл не тронут этим подэтапом (чужой/базовый).

## Миграция для ревью (Q28)

Файл: `apps/api/prisma/migrations/20261118090000_order_offer_acceptance/migration.sql` (коммит e1c44a4b), применена только на одноразовой БД e2e.

```sql
ALTER TABLE "orders" ADD COLUMN "offerVersion" VARCHAR(32);
ALTER TABLE "orders" ADD COLUMN "offerAcceptedAt" TIMESTAMP(3);
```

Expand-only: две nullable-колонки без DEFAULT, без обратной засыпки, без деструктивных операций. Старые заказы остаются с NULL. Откат — contract-шаг (DROP COLUMN) только по отдельному решению владельца. Риск при выкате: код 0.5 требует колонки — сначала миграция, потом код.

## К переносу

Риски (R161+):

- R161. Контракт `POST /store/orders` и `quick-buy` изменён: без `offerVersion` теперь 400. Веб-клиент checkout пока эти эндпоинты не вызывает (поиск по `apps/web` пуст), но будущий UI обязан слать версию из `GET /store/checkout-config`.
- R162. `NickResolver` знает только привязанные аккаунты: гость не сможет купить на ник игрока, ни разу не привязавшего аккаунт, пока нет Mojang/Bridge-источников (0.12/0.13). Продуктовое решение: приемлемо ли.
- R163. Смена `store.offerVersion` инвалидирует уже открытые страницы оформления (400 `offer_version_mismatch`); клиент должен перечитать оферту.
- R164. В production `QUICK_BUY_ENABLED=false` по умолчанию; включает владелец в `.env` вместе с боевым запуском.
- R165. Ошибка `typecheck` в `audit.service.spec.ts` и prettier в `promocodes-admin.controller.ts` — не от 0.5; должны исчезнуть после слияния соседних веток стека.
- R166. ADR-0186 Р1–Р3 (лимиты на отказы по нику, Turnstile, выравнивание времени ответа, TTL и потолок PENDING-заказов) обязательны до включения платёжного провайдера в production; до их реализации провайдер и `QUICK_BUY_ENABLED` в production не включать.
- Отклонение от плана: у вошедшего пользователя с привязанным ником `targetMinecraftNick` необязателен (берётся привязанный ник); без привязки и без явного ника — 400 `nick_required`.
- Ревью Q&S 0.5 (доработка): `GET /store/orders/:orderNumber` для чужого и гостевого заказа теперь 404 «Заказ не найден» (идентично несуществующему, было 403); `PATCH /admin/settings` проверяет `store.offerVersion` (непусто, <= 32 символов); добавлен dev-симулятор вебхука (`docs/runbooks/payment-webhook-sim.md`, подпись — общая функция `computeWebhookSignature`); `prisma format` выровнял `cancelledAt` (только форматирование).

CHANGELOG: «0.5: акцепт оферты (offerVersion/offerAcceptedAt), проверка ника получателя, флаг QUICK_BUY_ENABLED, GET /store/checkout-config, 503 payment_unavailable без висячих заказов; миграция 20261118090000 (expand-only)».

## Допущения

- Версия оферты хранится в `site_settings` (ключ `store.offerVersion`), дефолт `1`, отдельной админ-формы нет.
- Акцепт передаётся версией в теле запроса, а не булевым флагом.
- Единый `nick_unavailable` для любого неизвестного сайту ника (в т.ч. чужого аккаунта без привязки).
- Коды 403 для выключенного quick-buy и 503 для отсутствия провайдера выбраны мной.
