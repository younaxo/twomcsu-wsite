# 0.5 Оформление и оплата (web), 2026-11-18

Ветка `feature/l0-05-checkout` (голова: `feature/l0-04-admin-orders`). Контракт API сверен с веткой `feature/l0-05-checkout-api` (read-only).

## Что сделано

- `/shop/checkout`: сводка из серверной корзины (итог только серверный), поле «ник получателя» с подсказкой привязанного ника (из публичного профиля), обязательный чекбокс оферты со ссылками на `/legal/terms` и `/legal/refunds`, кнопка «Оплатить». Ошибки: `offer_not_accepted`, `offer_version_mismatch` (согласие сбрасывается, конфигурация перечитывается), `nick_required`, `nick_unavailable` (единый текст), 503 `payment_unavailable` (сообщение и неактивная кнопка), `quick_buy_disabled`. Ошибки через `FormField`/`useFocusFirstInvalid`, сводка `FormErrorSummary`.
- `POST /store/orders` -> `paymentUrl`: внешний переход только на http(s); `null` (тестовый провайдер) -> `/shop/orders/[orderNumber]`.
- `/shop/orders/[orderNumber]`: опрос PENDING (3 с), остановка на финальном статусе, при 4xx и при unmount; aria-live polite; состояния загрузка / не найден (403 показывается как 404) / ошибка с повтором / аноним.
- Корзина: кнопка «Оформить заказ» стала ссылкой на `/shop/checkout`; ссылка поповера ведёт туда же.
- Дизайн: semantic tokens, solid-поверхности, Lucide, без blur/glass.

## Проверки

- `tsc --noEmit`: 0 ошибок.
- `npx vitest run` (apps/web): 114/114 файлов, 757/757 тестов (новых: 12 checkout, 8 order; обновлён тест кнопки корзины).
- eslint по `src/app`, `src/lib/store`, `src/components/shell`: 0 замечаний. Prettier по изменённым файлам: чисто.

## Что можно показать

Корзина -> «Оформить заказ» -> форма -> оплата на тестовом провайдере -> страница заказа с автообновлением PENDING -> COMPLETED (после dev-симулятора вебхука на API). Без провайдера: честное «Оплата временно недоступна» и неактивная кнопка.

## Допущения

1. Отдельной страницы «Оферта» нет; ссылка ведёт на пользовательское соглашение `/legal/terms` (+ возвраты). Нужно решение, какой документ считать офертой.
2. Привязанный ник в `/auth/me` не отдаётся; подсказка берётся из `GET /users/:username/public` (`minecraftName`). Если профиль скрыт, подсказка общая, решение остаётся за сервером (`nick_required`).
3. Анонимный quick-buy: UI на странице товара не делался (вне задачи: оформление корзины требует входа). Конфигурация `quickBuyEnabled` читается, код `quick_buy_disabled` отображается понятным текстом; аноним на `/shop/checkout` получает приглашение войти.
4. Если `GET /store/checkout-config` недоступен, форма не показывается (без версии оферты отправить заказ нельзя): ошибка с повтором.
5. Деньги и расчёт цены не менялись; packages/shared не трогался.

## Риски

- Опрос без верхнего лимита по времени (пока вкладка открыта и статус PENDING); при необходимости добавить потолок.
- Дефолтные тексты статусов (CANCELLED/REFUNDED) краткие; список заказов и доставка — 0.6/0.7.
- Переход на `paymentUrl` реального провайдера не проверялся (только мок/null).

## Файлы

- `apps/web/src/lib/store/checkout.ts` (новый)
- `apps/web/src/app/(site)/shop/checkout/page.tsx`, `checkout.test.tsx` (новые)
- `apps/web/src/app/(site)/shop/orders/[orderNumber]/page.tsx`, `order.test.tsx` (новые)
- `apps/web/src/app/(site)/shop/cart/page.tsx`, `cart.test.tsx`
- `apps/web/src/components/shell/floating-actions.tsx`
- `docs/reports/2026-11-18-l0-05-checkout-web.md`
