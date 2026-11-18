import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  PaymentWebhookEvent,
  WebhookHeaders,
} from './payment-provider.interface';

export const WEBHOOK_SIGNATURE_HEADER = 'x-twomc-signature';
export const WEBHOOK_TIMESTAMP_HEADER = 'x-twomc-timestamp';
/// Допустимое расхождение timestamp подписи с текущим временем (секунды).
export const WEBHOOK_TOLERANCE_SECONDS = 300;
/// Минимальная длина секрета вебхука (ADR-0187): короче — секрет считается
/// незаданным (fail closed), в Joi такое значение не пропускается вовсе.
export const MIN_WEBHOOK_SECRET_LENGTH = 32;

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

export function headerValue(
  headers: WebhookHeaders,
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/// Действующие секреты вебхука: текущий `PAYMENT_WEBHOOK_SECRET` и, на время
/// ротации, предыдущий `PAYMENT_WEBHOOK_SECRET_PREVIOUS` (ADR-0187). Секреты
/// короче `MIN_WEBHOOK_SECRET_LENGTH` отбрасываются; пустой результат —
/// провайдер не настроен. Значения никуда не логируются.
export function readWebhookSecrets(config: ConfigService): string[] {
  const current = config.get<string>('PAYMENT_WEBHOOK_SECRET') ?? '';
  const previous = config.get<string>('PAYMENT_WEBHOOK_SECRET_PREVIOUS') ?? '';
  return [current, previous].filter(
    (s) => s.length >= MIN_WEBHOOK_SECRET_LENGTH,
  );
}

/// Проверка подписи ЛЮБЫМ из секретов (все секреты проверяются, без раннего
/// выхода по совпадению — время не зависит от того, какой секрет подошёл).
export function verifySignedWebhook(
  secrets: string[],
  rawBody: Buffer | undefined,
  headers: WebhookHeaders,
  now: Date,
): PaymentWebhookEvent | null {
  if (secrets.length === 0 || !rawBody) {
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
  const given = /^[0-9a-f]{64}$/i.test(signature)
    ? Buffer.from(signature, 'hex')
    : null;
  if (!given) {
    return null;
  }
  let matched = false;
  for (const secret of secrets) {
    const expected = computeWebhookSignature(secret, timestamp, rawBody);
    if (given.length === expected.length && timingSafeEqual(given, expected)) {
      matched = true;
    }
  }
  return matched ? parseWebhookEvent(rawBody) : null;
}

export function parseWebhookEvent(rawBody: Buffer): PaymentWebhookEvent | null {
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
