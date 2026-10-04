import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { CreatedPayment, PaymentProvider } from './payment-provider.interface';

/// Регистрируется только вне production (PaymentProviderRegistry, ADR-0009).
/// Не создаёт реального редиректа — `paymentUrl: null`, оплата
/// «подтверждается» вебхуком на /webhooks/payments/test с секретом
/// PAYMENT_WEBHOOK_SECRET в теле (как Voting webhook, ADR-0025 — не
/// HMAC-заголовок над сырым телом, а значение в самом JSON).
@Injectable()
export class TestPaymentProvider implements PaymentProvider {
  readonly name = 'test';

  async createPayment(
    orderNumber: string,
    _amount: Prisma.Decimal,
    _description: string,
  ): Promise<CreatedPayment> {
    return {
      paymentId: `test_${orderNumber}_${randomBytes(4).toString('hex')}`,
      paymentUrl: null,
    };
  }
}
