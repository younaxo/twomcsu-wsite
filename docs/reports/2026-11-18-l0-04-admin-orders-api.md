# Подэтап 0.4 — API заказов, промокодов и скидок в админке

Ветка: feature/l0-04-admin-orders-api. Дата: 2026-11-18.

## Что сделано
- Список заказов `GET /admin/orders`: фильтры status, userId, orderNumber, nickname, search, dateFrom/dateTo (дата без времени в `dateTo` = конец суток), пагинация со стабильной сортировкой (createdAt, id). Проверка dateFrom <= dateTo.
- Суженный `ADMIN_ORDER_INCLUDE`: позиции по белому списку полей, без gameCommands; получатель подарка — публичные поля; покупатель — публичные поля и email.
- Карточка `GET /admin/orders/:id` (id или номер): позиции, суммы, промокод, сводка оплаты (`payment`).
- Отмена `PATCH /admin/orders/:id/cancel`: только PENDING, `SELECT ... FOR UPDATE` в транзакции, иначе 409 `ORDER_NOT_CANCELLABLE`; причина обязательна (trim); аудит `orders.order.cancelled` в tx со `strict`.
- Промокоды и скидки: Decimal-строки (`IsDecimalInput`), проценты 0–100, проверка дат, аудит в tx со `strict`; право `store.discounts.view`.
- Экспорт: существующий `POST /admin/orders/export` (право `orders.export`, лимит MAX_ROWS, без email и ПДн); изменений не потребовал.
- 2FA персонала — общий `PermissionsGuard` (ADR-0169), покрыт `two-factor.e2e-spec.ts`.

## Проверки
- typecheck API (`tsc --noEmit`): без ошибок.
- Юнит `jest src/modules/store`: 9 наборов, 143/143 тестов.
- e2e `orders-admin.e2e-spec.ts` (одноразовая БД): 5/5. Логи: `scratchpad/logs-l004-2/summary.txt` (первая попытка 4/5: ошибка в самом тесте — число 10 допускается намеренно для совместимости).

## Допущения
- События вебхука в БД не хранятся (только paymentWebhookVerifiedAt, paidAt, paymentId, paymentProvider), поэтому в карточке — сводка оплаты, а не журнал событий.
- Причина отмены хранится в существующем `Order.cancelReason` и дублируется в аудите; схема не менялась.
- Миграций в этой работе нет.
- 2FA-сценарий в e2e не дублируется, чтобы не включать глобальный флаг requireAdmin2fa.
- Экспорт не покрыт аудитом (как и прежде).

## Риски
- JSON number в `discountValue` по-прежнему принимается (приводится к строке) ради совместимости.
- Экспорт заказов не пишет аудит выгрузки.
- Новое право `store.discounts.view` нужно выдать ролям через seed/синхронизацию прав (seed не запускался).

## К переносу
- Журнал событий вебхука оплаты (требует модели/миграции — решение владельца).
- Аудит экспорта заказов.
- UI админки (0.4 web) под новые эндпоинты и фильтры.
- Выдача `store.discounts.view` существующим ролям при деплое.
