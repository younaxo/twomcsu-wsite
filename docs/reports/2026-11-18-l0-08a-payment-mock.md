# 0.8a — платёжный слой: расширенный PaymentProvider, mock-http, fail-closed

## 1. Итог и статус

Общий интерфейс платёжного провайдера расширен (статус платежа, полный и частичный возврат с idempotencyKey), добавлен адаптер mock-http с локальным мок-сервером, fail-closed, возврат FAILED -> COMPLETED при позднем succeeded и ротация секрета вебхука. Статус: DONE для 0.8a (возврат к OrdersService.refund не подключён намеренно: это 0.9; PR не открыт, push не делался).

## 2. Что сделано

- Интерфейс PaymentProvider: getPaymentStatus, refund(paymentId, amount, idempotencyKey), единый PaymentProviderError (unavailable, timeout, rejected, not_found, refund_not_allowed, invalid_response, not_configured).
- Адаптер mock-http (только development/test): таймаут, ретраи временных сбоев, заголовок Idempotency-Key, Bearer-ключ.
- Реестр: пустой PAYMENT_PROVIDER или пустые секреты -> провайдера нет -> 503 payment_unavailable; в production test и mock-http не регистрируются.
- Вебхук: поздний succeeded по FAILED переводит заказ в COMPLETED (после проверок суммы, валюты, paymentId); по CANCELLED только предупреждение; повтор идемпотентен.
- Подпись вебхука: два секрета (текущий и предыдущий), минимум 32 символа, постоянное время сравнения.
- Мок-сервер и хелперы для тестов: apps/api/test/helpers/mock-payment-provider.ts, mock-payment-env.ts. In-memory реестр платежей payment-ledger.
- ADR-0187 (Proposed) в docs/implementation/DECISIONS.md.
- e2e: новая группа store-payment-mock (успех, отказ, поздний succeeded после FAILED, повтор вебхука, ротация секрета и отказ по чужому и короткому секрету, getPaymentStatus, частичный и полный возврат, идемпотентность возврата, переполнение возврата, ретрай при 5xx). В store-checkout.e2e-spec.ts в тестовый модуль добавлен MockHttpPaymentProvider (зависимость реестра).

## 3. Git

Ветка feature/l0-08a-payment (worktree twomcsu-wsite-wt/e2e), база 06eb72d6. Коммиты:
- 543d770b интерфейс, ошибки, реестр, адаптер, ledger, подпись, env
- b1a4cadd FAILED -> COMPLETED, вебхук, тестовые хелперы
- 56ebbf4a ADR-0187
- 4e8fb179 e2e
- коммит этого отчёта (следующий за 4e8fb179)
PR не открыт, push не выполнялся. Миграций и изменений схемы нет.

## 4. Проверки

- jest (apps/api, полный): 126 из 127 наборов пройдено, 1 пропущен; тестов 2327 пройдено, 6 пропущено, 0 упавших.
- Юниты затронутых файлов (config + store): 22 набора, 402 теста, все зелёные.
- tsc --noEmit: чисто.
- eslint по всем изменённым файлам: чисто. eslint по src и test целиком: 14 ошибок prettier в 9 файлах, не входящих в 0.8a (bridge-*, prisma.service.client-options.spec.ts, promocodes-admin.controller.ts); не трогал, чужая область.
- e2e на одноразовой БД (e2e-guarded.sh, ОЗУ ~10 ГБ свободно): store-payment-mock 5 из 5, store-checkout 37 из 37 (первый прогон: 1 падение из-за недостающего провайдера в тестовом модуле, исправлено), store-checkout-unavailable 4 из 4, store-delivery 41 из 41. Использовано 2 запуска из 3. Логи: scratchpad/e2e-08a/run1 и run2.
- Отдельного e2e для fail-closed с mock-http нет: покрыто store-checkout-unavailable (503 payment_unavailable, вебхук 404) и юнитами реестра.

## 5. Что осталось

- 0.9: подключение refund к OrdersService.refund, сверка PENDING через getPaymentStatus, устойчивое хранение идемпотентности возвратов (сейчас in-memory ledger только для мока).
- Конкретный провайдер, боевые ключи и production — у владельца.
- Pre-existing ошибки prettier в 9 файлах вне 0.8a.

## 6. Решения владельца

Не требуются. Допущение: номер ADR-0187 выбран как следующий после ADR-0186; ADR-0184-0186 лежат в других ветках, при слиянии проверить конфликт номера и места в файле.

## 7. Риски и расхождения

- R29: шторм повторов при сбое провайдера ограничен (по умолчанию 2 повтора, максимум 5, отдельно от лимита quick-buy 10/мин).
- Поздний succeeded по CANCELLED не восстанавливает заказ (ручной разбор по логу).
- Идемпотентность возвратов на стороне платформы пока не персистентна (до 0.9).
- Возможный конфликт DECISIONS.md при слиянии с ветками ADR-0184-0186.

## 8. NEXT EXACT STEP

Открыть PR для feature/l0-08a-payment через agent-push.sh после проверки конфликтов DECISIONS.md; затем 0.9.

## К переносу

Риски (RISKS.md): R29 (ограничен лимитом ретраев провайдера, ADR-0187); новый: нет персистентной идемпотентности возвратов до 0.9; поздний succeeded по CANCELLED только лог.
CHANGELOG: 0.8a — расширенный PaymentProvider (getPaymentStatus, refund с idempotencyKey), адаптер mock-http (dev/test), fail-closed, FAILED -> COMPLETED при позднем succeeded, ротация секрета вебхука (два секрета, минимум 32 символа), ADR-0187.
