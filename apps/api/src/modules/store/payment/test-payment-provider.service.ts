import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { InMemoryPaymentLedger } from './payment-ledger';
import {
  CreatedPayment,
  PaymentProvider,
  PaymentWebhookEvent,
  ProviderPaymentStatus,
  ProviderRefund,
  WebhookHeaders,
} from './payment-provider.interface';
import { readWebhookSecrets, verifySignedWebhook } from './webhook-signature';

// Подпись и константы вынесены в webhook-signature.ts; реэкспорт сохраняет
// прежние пути импорта (симулятор, тесты).
export {
  computeWebhookSignature,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  WEBHOOK_TOLERANCE_SECONDS,
} from './webhook-signature';

/// Регистрируется только в development/test (PaymentProviderRegistry,
/// ADR-0009). Не создаёт реального редиректа — `paymentUrl: null`. Вебхук
/// подписан HMAC-SHA256 над `timestamp.rawBody` секретом PAYMENT_WEBHOOK_SECRET
/// (ADR-0157; минимум 32 символа и ротация через PAYMENT_WEBHOOK_SECRET_PREVIOUS,
/// ADR-0187); без действующего секрета — всегда отказ. Статус и возврат —
/// по учёту в памяти процесса (`InMemoryPaymentLedger`), без сети.
@Injectable()
export class TestPaymentProvider implements PaymentProvider {
  readonly name = 'test';
  readonly currency = 'RUB';
  private readonly ledger = new InMemoryPaymentLedger();

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return readWebhookSecrets(this.config).length > 0;
  }

  async createPayment(
    orderNumber: string,
    amount: Prisma.Decimal,
    _description: string,
  ): Promise<CreatedPayment> {
    const paymentId = `test_${orderNumber}_${randomBytes(4).toString('hex')}`;
    this.ledger.create(paymentId, orderNumber, amount, this.currency);
    return { paymentId, paymentUrl: null };
  }

  verifyWebhook(
    rawBody: Buffer | undefined,
    headers: WebhookHeaders,
    now: Date = new Date(),
  ): PaymentWebhookEvent | null {
    const event = verifySignedWebhook(
      readWebhookSecrets(this.config),
      rawBody,
      headers,
      now,
    );
    if (event) {
      this.ledger.create(
        event.paymentId,
        event.orderNumber,
        event.amount,
        event.currency,
      );
      this.ledger.setStatus(event.paymentId, event.status);
    }
    return event;
  }

  async getPaymentStatus(paymentId: string): Promise<ProviderPaymentStatus> {
    return this.ledger.getStatus(paymentId);
  }

  async refund(
    paymentId: string,
    amount: Prisma.Decimal,
    idempotencyKey: string,
  ): Promise<ProviderRefund> {
    return this.ledger.refund(paymentId, amount, idempotencyKey);
  }
}
