import { Prisma } from '@prisma/client';

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

/// ADR-0009: заказ переходит в COMPLETED только через вебхук с проверенной
/// подписью — ни один провайдер не предоставляет client-triggered «complete».
export interface PaymentProvider {
  readonly name: string;
  /// Валюта платежей провайдера: в `Order` поля currency нет (ADR-0157).
  readonly currency: string;
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
}
