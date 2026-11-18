import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  PaymentProviderError,
  PaymentProviderErrorCode,
} from './payment-provider.errors';
import {
  CreatedPayment,
  PaymentProvider,
  PaymentWebhookEvent,
  ProviderPaymentState,
  ProviderPaymentStatus,
  ProviderRefund,
  ProviderRefundState,
  WebhookHeaders,
} from './payment-provider.interface';
import { readWebhookSecrets, verifySignedWebhook } from './webhook-signature';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const IDEMPOTENCY_KEY_FORMAT = /^[A-Za-z0-9._:-]+$/;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 200;
const PAYMENT_STATES: readonly ProviderPaymentState[] = [
  'pending',
  'succeeded',
  'failed',
  'refunded',
];
const REFUND_STATES: readonly ProviderRefundState[] = [
  'pending',
  'succeeded',
  'failed',
];

/// Адрес мок-сервера допустим только на loopback по http: адаптер `mock-http`
/// не должен ходить во внешнюю сеть (0.8a, ADR-0187).
export function parseMockBaseUrl(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) {
    return null;
  }
  return `${url.protocol}//${url.host}`;
}

/// Адаптер «mock-http» (0.8a, ADR-0187): говорит по HTTP с локальным
/// мок-сервером провайдера за общим интерфейсом `PaymentProvider`. Только
/// dev/test (PaymentProviderRegistry), только loopback. Таймаут запроса
/// `PAYMENT_HTTP_TIMEOUT_MS`, повторы временных сбоев (сеть, таймаут, 5xx,
/// 429) до `PAYMENT_HTTP_RETRIES` раз; все запросы несут `Idempotency-Key`,
/// поэтому повтор не создаёт дубль. Ключ `PAYMENT_API_KEY` уходит только в
/// заголовок Authorization и ни в ошибки, ни в логи не попадает.
@Injectable()
export class MockHttpPaymentProvider implements PaymentProvider {
  readonly name = 'mock-http';
  readonly currency = 'RUB';

  constructor(private readonly config: ConfigService) {}

  private baseUrl(): string | null {
    return parseMockBaseUrl(this.config.get<string>('PAYMENT_MOCK_BASE_URL'));
  }

  isConfigured(): boolean {
    return (
      this.baseUrl() !== null && readWebhookSecrets(this.config).length > 0
    );
  }

  async createPayment(
    orderNumber: string,
    amount: Prisma.Decimal,
    description: string,
  ): Promise<CreatedPayment> {
    const body = await this.request(
      'POST',
      '/payments',
      `create:${orderNumber}`,
      {
        orderNumber,
        amount: amount.toFixed(2),
        currency: this.currency,
        description,
      },
    );
    if (typeof body.paymentId !== 'string' || body.paymentId.length === 0) {
      throw new PaymentProviderError('invalid_response');
    }
    return {
      paymentId: body.paymentId,
      paymentUrl: typeof body.paymentUrl === 'string' ? body.paymentUrl : null,
    };
  }

  verifyWebhook(
    rawBody: Buffer | undefined,
    headers: WebhookHeaders,
    now: Date = new Date(),
  ): PaymentWebhookEvent | null {
    return verifySignedWebhook(
      readWebhookSecrets(this.config),
      rawBody,
      headers,
      now,
    );
  }

  async getPaymentStatus(paymentId: string): Promise<ProviderPaymentStatus> {
    const body = await this.request(
      'GET',
      `/payments/${encodeURIComponent(paymentId)}`,
    );
    const status = body.status;
    if (
      typeof body.paymentId !== 'string' ||
      typeof status !== 'string' ||
      !PAYMENT_STATES.includes(status as ProviderPaymentState) ||
      typeof body.currency !== 'string'
    ) {
      throw new PaymentProviderError('invalid_response');
    }
    return {
      paymentId: body.paymentId,
      status: status as ProviderPaymentState,
      amount: toDecimal(body.amount),
      currency: body.currency,
      refundedAmount: toDecimal(body.refundedAmount),
    };
  }

  async refund(
    paymentId: string,
    amount: Prisma.Decimal,
    idempotencyKey: string,
  ): Promise<ProviderRefund> {
    assertIdempotencyKey(idempotencyKey);
    const body = await this.request(
      'POST',
      `/payments/${encodeURIComponent(paymentId)}/refunds`,
      idempotencyKey,
      { amount: amount.toFixed(2) },
    );
    const status = body.status;
    if (
      typeof body.refundId !== 'string' ||
      typeof status !== 'string' ||
      !REFUND_STATES.includes(status as ProviderRefundState) ||
      typeof body.currency !== 'string'
    ) {
      throw new PaymentProviderError('invalid_response');
    }
    return {
      refundId: body.refundId,
      paymentId:
        typeof body.paymentId === 'string' ? body.paymentId : paymentId,
      status: status as ProviderRefundState,
      amount: toDecimal(body.amount),
      currency: body.currency,
    };
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    idempotencyKey?: string,
    payload?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const base = this.baseUrl();
    if (!base) {
      throw new PaymentProviderError('not_configured');
    }
    const retries = this.numberConfig('PAYMENT_HTTP_RETRIES', DEFAULT_RETRIES);
    const delay = this.numberConfig(
      'PAYMENT_HTTP_RETRY_DELAY_MS',
      DEFAULT_RETRY_DELAY_MS,
    );
    let last: PaymentProviderError | undefined;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await this.requestOnce(
          method,
          base + path,
          idempotencyKey,
          payload,
        );
      } catch (error) {
        if (!(error instanceof PaymentProviderError) || !error.retryable) {
          throw error;
        }
        last = error;
        if (attempt < retries && delay > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, delay * (attempt + 1)),
          );
        }
      }
    }
    throw last ?? new PaymentProviderError('unavailable');
  }

  private async requestOnce(
    method: 'GET' | 'POST',
    url: string,
    idempotencyKey: string | undefined,
    payload: Record<string, unknown> | undefined,
  ): Promise<Record<string, unknown>> {
    const timeoutMs = this.numberConfig(
      'PAYMENT_HTTP_TIMEOUT_MS',
      DEFAULT_TIMEOUT_MS,
    );
    const headers: Record<string, string> = { accept: 'application/json' };
    if (payload) {
      headers['content-type'] = 'application/json';
    }
    if (idempotencyKey) {
      assertIdempotencyKey(idempotencyKey);
      headers['idempotency-key'] = idempotencyKey;
    }
    const apiKey = this.config.get<string>('PAYMENT_API_KEY') ?? '';
    if (apiKey) {
      headers.authorization = `Bearer ${apiKey}`;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    let text: string;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: payload ? JSON.stringify(payload) : undefined,
        signal: controller.signal,
        // Редиректы не выполняем: мок-сервер не должен уводить адаптер за
        // пределы loopback (SSRF).
        redirect: 'manual',
      });
      text = await response.text();
    } catch (error) {
      // Текст исходной ошибки (может содержать URL/адрес) наружу не отдаём.
      const aborted = (error as { name?: string }).name === 'AbortError';
      throw new PaymentProviderError(aborted ? 'timeout' : 'unavailable');
    } finally {
      clearTimeout(timer);
    }
    if (
      response.type === 'opaqueredirect' ||
      (response.status >= 300 && response.status < 400)
    ) {
      throw new PaymentProviderError('rejected', 'redirect_not_allowed');
    }
    const parsed = parseJsonObject(text);
    if (response.ok) {
      if (!parsed) {
        throw new PaymentProviderError('invalid_response');
      }
      return parsed;
    }
    throw new PaymentProviderError(mapErrorCode(response.status, parsed));
  }

  private numberConfig(key: string, fallback: number): number {
    const raw = this.config.get<number | string>(key);
    const value = typeof raw === 'string' ? Number(raw) : raw;
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value
      : fallback;
  }
}

/// Ключ идемпотентности: 1..128 символов, только [A-Za-z0-9._:-] (как в ledger
/// по длине; формат строже, чтобы ключ был безопасен для заголовка).
function assertIdempotencyKey(key: string): void {
  if (
    !key ||
    key.length > MAX_IDEMPOTENCY_KEY_LENGTH ||
    !IDEMPOTENCY_KEY_FORMAT.test(key)
  ) {
    throw new PaymentProviderError('rejected', 'idempotency_key_invalid');
  }
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function mapErrorCode(
  status: number,
  body: Record<string, unknown> | null,
): PaymentProviderErrorCode {
  if (status === 404) {
    return 'not_found';
  }
  if (status === 429 || status >= 500) {
    return 'unavailable';
  }
  if (status === 409 && body?.error === 'refund_not_allowed') {
    return 'refund_not_allowed';
  }
  return 'rejected';
}

function toDecimal(value: unknown): Prisma.Decimal {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !/^\d{1,8}(\.\d{1,2})?$/.test(text)) {
    throw new PaymentProviderError('invalid_response');
  }
  return new Prisma.Decimal(text);
}
