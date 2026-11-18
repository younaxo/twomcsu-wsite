import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import {
  CreatedPayment,
  PaymentProvider,
  PaymentWebhookEvent,
  WebhookHeaders,
} from './payment-provider.interface';

export const WEBHOOK_SIGNATURE_HEADER = 'x-twomc-signature';
export const WEBHOOK_TIMESTAMP_HEADER = 'x-twomc-timestamp';
/// Допустимое расхождение timestamp подписи с текущим временем (секунды).
export const WEBHOOK_TOLERANCE_SECONDS = 300;

/// Подпись вебхука: HMAC-SHA256 над `timestamp.rawBody` (digest). Единая
/// функция для проверки провайдером и для dev-симулятора.
export function computeWebhookSignature(
  secret: string,
  timestamp: string,
  rawBody: Buffer | string,
): Buffer {
  return createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest();
}

function headerValue(
  headers: WebhookHeaders,
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/// Регистрируется только в development/test (PaymentProviderRegistry,
/// ADR-0009). Не создаёт реального редиректа — `paymentUrl: null`. Вебхук
/// подписан HMAC-SHA256 над `timestamp.rawBody` секретом PAYMENT_WEBHOOK_SECRET
/// (ADR-0157); пустой секрет — всегда отказ.
@Injectable()
export class TestPaymentProvider implements PaymentProvider {
  readonly name = 'test';
  readonly currency = 'RUB';

  constructor(private readonly config: ConfigService) {}

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

  verifyWebhook(
    rawBody: Buffer | undefined,
    headers: WebhookHeaders,
    now: Date = new Date(),
  ): PaymentWebhookEvent | null {
    const secret = this.config.get<string>('PAYMENT_WEBHOOK_SECRET') ?? '';
    if (secret.length === 0 || !rawBody) {
      return null;
    }
    const signature = headerValue(headers, WEBHOOK_SIGNATURE_HEADER);
    const timestamp = headerValue(headers, WEBHOOK_TIMESTAMP_HEADER);
    if (!signature || !timestamp || !/^\d{1,13}$/.test(timestamp)) {
      return null;
    }
    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (Math.abs(nowSeconds - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) {
      return null;
    }
    const expected = computeWebhookSignature(secret, timestamp, rawBody);
    const given = /^[0-9a-f]{64}$/i.test(signature)
      ? Buffer.from(signature, 'hex')
      : null;
    if (!given || given.length !== expected.length) {
      return null;
    }
    if (!timingSafeEqual(given, expected)) {
      return null;
    }
    return this.parseEvent(rawBody);
  }

  private parseEvent(rawBody: Buffer): PaymentWebhookEvent | null {
    let body: unknown;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return null;
    }
    if (typeof body !== 'object' || body === null) {
      return null;
    }
    const b = body as Record<string, unknown>;
    if (
      typeof b.orderNumber !== 'string' ||
      typeof b.paymentId !== 'string' ||
      typeof b.currency !== 'string' ||
      (b.status !== 'succeeded' && b.status !== 'failed') ||
      (typeof b.amount !== 'string' && typeof b.amount !== 'number')
    ) {
      return null;
    }
    const amountText = String(b.amount);
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(amountText)) {
      return null;
    }
    return {
      orderNumber: b.orderNumber,
      paymentId: b.paymentId,
      status: b.status,
      amount: new Prisma.Decimal(amountText),
      currency: b.currency,
    };
  }
}
