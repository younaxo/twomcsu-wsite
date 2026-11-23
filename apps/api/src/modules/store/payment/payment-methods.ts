/// Способы оплаты (0.8b, ADR-0193). Зеркало PAYMENT_METHOD_CODES из
/// @twomc/shared (api не импортирует shared, как и StoreCartError).
export const PAYMENT_METHOD_CODES = [
  'SBP',
  'CARD_RU',
  'SBERPAY',
  'CRYPTO',
  'CARD_FOREIGN',
] as const;

export type PaymentMethodCode = (typeof PAYMENT_METHOD_CODES)[number];

export function isPaymentMethodCode(
  value: unknown,
): value is PaymentMethodCode {
  return (
    typeof value === 'string' &&
    (PAYMENT_METHOD_CODES as readonly string[]).includes(value)
  );
}

/// Публичные названия: единственные поля способа, уходящие клиенту.
export const PAYMENT_METHOD_TITLES: Record<PaymentMethodCode, string> = {
  SBP: 'СБП',
  CARD_RU: 'Банковская карта РФ',
  SBERPAY: 'SberPay',
  CRYPTO: 'Криптовалюта',
  CARD_FOREIGN: 'Иностранная карта',
};

export interface PaymentMethodRoute {
  method: PaymentMethodCode;
  provider: string;
}

/// Разбор `PAYMENT_METHODS`: `SBP:mock-ru,CRYPTO:mock-crypto`. Неизвестные
/// способы, пустые и повторные записи отбрасываются (первая запись выигрывает);
/// строгая проверка формата — в Joi при старте.
export function parsePaymentMethodRoutes(
  raw: string | undefined | null,
): PaymentMethodRoute[] {
  const routes: PaymentMethodRoute[] = [];
  const seen = new Set<string>();
  for (const part of (raw ?? '').split(',')) {
    const [method, provider, ...rest] = part.trim().split(':');
    if (
      rest.length > 0 ||
      !isPaymentMethodCode(method) ||
      !provider ||
      !/^[a-z0-9-]{1,32}$/.test(provider) ||
      seen.has(method)
    ) {
      continue;
    }
    seen.add(method);
    routes.push({ method, provider });
  }
  return routes;
}

/// Формат значения `PAYMENT_METHODS` для Joi (пустое значение допустимо).
export const PAYMENT_METHODS_PATTERN =
  /^$|^(SBP|CARD_RU|SBERPAY|CRYPTO|CARD_FOREIGN):[a-z0-9-]{1,32}(,(SBP|CARD_RU|SBERPAY|CRYPTO|CARD_FOREIGN):[a-z0-9-]{1,32})*$/;
