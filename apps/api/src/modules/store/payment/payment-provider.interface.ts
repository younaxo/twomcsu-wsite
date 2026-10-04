import { Prisma } from '@prisma/client';

export interface CreatedPayment {
  paymentId: string;
  /// null — провайдер не требует редиректа (напр. тестовый).
  paymentUrl: string | null;
}

/// ADR-0009: заказ переходит в COMPLETED только через вебхук с проверенной
/// подписью — ни один провайдер не предоставляет client-triggered «complete».
export interface PaymentProvider {
  readonly name: string;
  createPayment(
    orderNumber: string,
    amount: Prisma.Decimal,
    description: string,
  ): Promise<CreatedPayment>;
}
