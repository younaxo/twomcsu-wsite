import { Prisma } from '@prisma/client';
import type { PaymentMethodCode } from './payment-methods';

export interface CreatedPayment {
  paymentId: string;
  /// null — провайдер не требует редиректа (напр. тестовый).
  paymentUrl: string | null;
}

/// Проверенное событие вебхука: возвращается только после успешной
/// проверки подписи над сырым телом (ADR-0157).
export interface PaymentWebhookEvent {
  orderNumber: string;
  paymentId: string;
  status: 'succeeded' | 'failed';
  amount: Prisma.Decimal;
  currency: string;
}

export type WebhookHeaders = Record<string, string | string[] | undefined>;

/// Состояние платежа у провайдера (ADR-0187). `refunded` — возвращён весь
/// платёж; частичный возврат отражается в `refundedAmount` при `succeeded`.
export type ProviderPaymentState =
  'pending' | 'succeeded' | 'failed' | 'refunded';

export interface ProviderPaymentStatus {
  paymentId: string;
  status: ProviderPaymentState;
  amount: Prisma.Decimal;
  currency: string;
  /// Сумма, уже возвращённая по платежу (0, если возвратов нет).
  refundedAmount: Prisma.Decimal;
}

export type ProviderRefundState = 'pending' | 'succeeded' | 'failed';

export interface ProviderRefund {
  refundId: string;
  paymentId: string;
  status: ProviderRefundState;
  amount: Prisma.Decimal;
  currency: string;
}

/// ADR-0009: заказ переходит в COMPLETED только через вебхук с проверенной
/// подписью — ни один провайдер не предоставляет client-triggered «complete».
/// Ошибки методов, обращающихся к провайдеру, — `PaymentProviderError`
/// (payment-provider.errors.ts, ADR-0187).
export interface PaymentProvider {
  readonly name: string;
  /// Валюта платежей провайдера: в `Order` поля currency нет (ADR-0157).
  readonly currency: string;
  /// Способы оплаты, которые провайдер умеет принимать (0.8b); не задано —
  /// провайдер не ограничивает способ (устаревший путь PAYMENT_PROVIDER).
  readonly supportedMethods?: readonly PaymentMethodCode[];
  /// false — нет ключей/секретов: реестр не отдаёт провайдера как рабочего
  /// (оформление отвечает 503 payment_unavailable, fail closed, ADR-0187).
  isConfigured(): boolean;
  createPayment(
    orderNumber: string,
    amount: Prisma.Decimal,
    description: string,
  ): Promise<CreatedPayment>;
  /// Проверяет подпись над СЫРЫМ телом и разбирает событие. `null` — подпись
  /// неверна/отсутствует/просрочена либо тело не является валидным событием.
  verifyWebhook(
    rawBody: Buffer | undefined,
    headers: WebhookHeaders,
  ): PaymentWebhookEvent | null;
  /// Запрос статуса платежа у провайдера (сверка PENDING, 0.9). Только чтение.
  getPaymentStatus(paymentId: string): Promise<ProviderPaymentStatus>;
  /// Возврат полный или частичный. `idempotencyKey` обязателен: повтор с тем
  /// же ключом возвращает тот же результат и не создаёт второй возврат.
  /// Сумма возврата и сумма уже возвращённого не превышают оплаченное.
  refund(
    paymentId: string,
    amount: Prisma.Decimal,
    idempotencyKey: string,
  ): Promise<ProviderRefund>;
}
