import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { InMemoryPaymentLedger } from './payment-ledger';
import { PaymentMethodCode } from './payment-methods';
import {
  CreatedPayment,
  PaymentProvider,
  PaymentWebhookEvent,
  ProviderPaymentStatus,
  ProviderRefund,
  WebhookHeaders,
} from './payment-provider.interface';
import { readWebhookSecrets, verifySignedWebhook } from './webhook-signature';

export interface MockMethodProviderSpec {
  name: string;
  /// Префикс paymentId (без случайной части — детерминированный id).
  idPrefix: string;
  supportedMethods: readonly PaymentMethodCode[];
}

/// Мок-провайдеры маршрутизатора (0.8b, ADR-0193): `mock-ru` (СБП, карта РФ,
/// SberPay), `mock-crypto` (крипто), `mock-foreign` (иностранная карта).
export const MOCK_METHOD_PROVIDER_SPECS: readonly MockMethodProviderSpec[] = [
  {
    name: 'mock-ru',
    idPrefix: 'mockru',
    supportedMethods: ['SBP', 'CARD_RU', 'SBERPAY'],
  },
  {
    name: 'mock-crypto',
    idPrefix: 'mockcrypto',
    supportedMethods: ['CRYPTO'],
  },
  {
    name: 'mock-foreign',
    idPrefix: 'mockforeign',
    supportedMethods: ['CARD_FOREIGN'],
  },
];

/// Мок без сети: детерминированный `paymentId = <prefix>_<orderNumber>`, поэтому
/// повтор `createPayment` по тому же заказу возвращает тот же платёж (дубль не
/// создаётся). Подпись вебхука — общий HMAC (webhook-signature.ts) с общими
/// секретами `PAYMENT_WEBHOOK_SECRET*`; статус и возвраты — в памяти процесса
/// (`InMemoryPaymentLedger`, идемпотентность возврата по ключу). Расчётная
/// валюта — RUB (прайс магазина в рублях; пересчёт — задача боевого адаптера).
/// Регистрируется только реестром и только в development/test.
export class MockMethodPaymentProvider implements PaymentProvider {
  readonly name: string;
  readonly currency = 'RUB';
  readonly supportedMethods: readonly PaymentMethodCode[];
  private readonly idPrefix: string;
  private readonly ledger = new InMemoryPaymentLedger();

  constructor(
    private readonly config: ConfigService,
    spec: MockMethodProviderSpec,
  ) {
    this.name = spec.name;
    this.idPrefix = spec.idPrefix;
    this.supportedMethods = spec.supportedMethods;
  }

  isConfigured(): boolean {
    return readWebhookSecrets(this.config).length > 0;
  }

  async createPayment(
    orderNumber: string,
    amount: Prisma.Decimal,
    _description: string,
  ): Promise<CreatedPayment> {
    const paymentId = `${this.idPrefix}_${orderNumber}`;
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
