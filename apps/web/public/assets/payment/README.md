# Логотипы способов оплаты

Официальные SVG, предоставленные владельцем проекта (Visa, Mastercard, МИР, СБП),
оптимизированы SVGO (`preset-default` без `removeViewBox`/`removeTitle`), внешний
вид и viewBox `0 0 48 32` сохранены, `<title>` — для доступности.

Используются компонентом `components/shell/PaymentMethodLogos` через конфиг
`PAYMENT_METHODS` в `lib/site/config.ts`. Не вставлять data URI в JSX.
