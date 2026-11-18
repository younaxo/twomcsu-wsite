# Симулятор подписанного вебхука оплаты (dev)

Скрипт `apps/api/scripts/payment-webhook-sim.ts` шлёт на локальный API тот же подписанный вебхук, что отправил бы провайдер `test` (ADR-0157): `POST /webhooks/payments/test`, HMAC-SHA256 над `timestamp.rawBody`. Подпись считается общей функцией `computeWebhookSignature` из `apps/api/src/modules/store/payment/test-payment-provider.service.ts` — той же, что проверяет вебхук.

## Ограничения

- Только `NODE_ENV=development` или `test`. Пустой или любой другой `NODE_ENV` (в том числе `production`) — отказ (fail closed).
- Секрет берётся из переменной окружения `PAYMENT_WEBHOOK_SECRET` (локальный `.env`, задан для dev/test). Значения секретов скрипт не печатает. Реальные ключи сюда не подставляются.
- Тестовый провайдер регистрируется только в development/test, поэтому на production сервере вебхук вернёт 404.
- Строки в `package.json` нет намеренно: запуск через `npx ts-node`.

## Запуск

Из каталога `apps/api`, с запущенным API и локальной БД:

```
NODE_ENV=development npx ts-node scripts/payment-webhook-sim.ts succeeded O-XXXXXXXX-XXXXXX
NODE_ENV=development npx ts-node scripts/payment-webhook-sim.ts failed O-XXXXXXXX-XXXXXX
```

Необязательные аргументы: сумма и валюта (`... succeeded <номер> 270.00 RUB`). Без суммы берётся `total` заказа из БД (`DATABASE_URL`), валюта по умолчанию `RUB`. Неверная сумма или валюта проверяют ветки `amount_mismatch` / `currency_mismatch`.

Переменные: `API_URL` (по умолчанию `http://localhost:${API_PORT:-4000}`), `PAYMENT_WEBHOOK_SECRET`. Скрипт печатает только `HTTP <код>: <тело ответа>`.

## Проверка

Юнит-тест: `apps/api/src/modules/store/payment/payment-webhook-sim.spec.ts` (отказ вне dev/test, подпись принимается `TestPaymentProvider.verifyWebhook`).
