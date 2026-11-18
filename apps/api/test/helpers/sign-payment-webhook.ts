import { createHmac } from 'crypto';

export interface SignedWebhook {
  /// Ровно те байты, что нужно отправить телом запроса (подпись считается над ними).
  rawBody: string;
  headers: { 'x-twomc-signature': string; 'x-twomc-timestamp': string };
}

/// Подпись вебхука тестового провайдера (ADR-0157): HMAC-SHA256 над
/// `timestamp.rawBody`, hex. Используется в e2e и unit-тестах.
export function signPaymentWebhook(
  secret: string,
  body: Record<string, unknown> | string,
  timestampSeconds: number = Math.floor(Date.now() / 1000),
): SignedWebhook {
  const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
  const timestamp = String(timestampSeconds);
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return {
    rawBody,
    headers: {
      'x-twomc-signature': signature,
      'x-twomc-timestamp': timestamp,
    },
  };
}
