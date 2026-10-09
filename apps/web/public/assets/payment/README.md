# Логотипы способов оплаты

Сюда кладутся официальные SVG, предоставленные владельцем проекта
(оптимизировать SVGO без изменения вида): `visa.svg`, `mastercard.svg`,
`mir.svg`, `sbp.svg`. Список и размеры — `src/lib/site/config.ts`
(`PAYMENT_METHODS`), компонент — `components/shell/payment-method-logos.tsx`.
Пока файла нет, карточка показывает текстовую подпись — чужие иконки не
подставляются.
