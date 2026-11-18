import { Prisma } from '@prisma/client';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { InMemoryPaymentLedger } from '../../src/modules/store/payment/payment-ledger';
import { PaymentProviderError } from '../../src/modules/store/payment/payment-provider.errors';
import { signPaymentWebhook, SignedWebhook } from './sign-payment-webhook';

/// Мок-сервер платёжного провайдера (0.8a, ADR-0187): локальный HTTP-сервер
/// на 127.0.0.1 для тестов без сети. Только dev/test: в `src` не
/// импортируется. Говорит по HTTP с адаптером `mock-http`; вебхуки провайдера
/// имитируются подписанными запросами (`webhook`), которые тест сам шлёт в
/// `POST /webhooks/payments/mock-http`.
///
/// Сценарии: успех (`succeed`), отказ (`fail`), поздний вебхук (`fail`, затем
/// `succeed`), повтор вебхука (тест шлёт тот же `webhook` дважды), частичный и
/// полный возврат (`POST /payments/:id/refunds`), таймаут (`delayNext`),
/// временные сбои 5xx (`failNext`).
export interface MockPaymentProviderOptions {
  /// Если задан — запросы без `Authorization: Bearer <ключ>` получают 401.
  apiKey?: string;
}

export interface MockRequestRecord {
  method: string;
  path: string;
  idempotencyKey: string | undefined;
}

export class MockPaymentProvider {
  readonly ledger = new InMemoryPaymentLedger();
  readonly requests: MockRequestRecord[] = [];
  private server: Server | undefined;
  private failures: { count: number; status: number } = {
    count: 0,
    status: 503,
  };
  private delayMs = 0;
  private delayCount = 0;
  private readonly createdByKey = new Map<
    string,
    { paymentId: string; fingerprint: string }
  >();
  private seq = 0;

  constructor(private readonly options: MockPaymentProviderOptions = {}) {}

  /// `port` 0 — любой свободный; e2e задаёт порт заранее (mock-payment-env.ts):
  /// адрес читается ConfigModule при импорте AppModule, до старта сервера.
  async start(port = 0): Promise<string> {
    this.server = createServer((req, res) => {
      void this.handle(req, res);
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(port, '127.0.0.1', resolve),
    );
    return this.baseUrl;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (server) {
      await new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    }
  }

  get baseUrl(): string {
    const address = this.server?.address() as AddressInfo | null | undefined;
    if (!address) {
      throw new Error('Мок-сервер не запущен');
    }
    return `http://127.0.0.1:${address.port}`;
  }

  /// Следующие `count` запросов получат ответ с кодом `status`.
  failNext(count: number, status = 503): void {
    this.failures = { count, status };
  }

  /// Следующие `count` запросов будут отвечать не раньше чем через `ms`.
  delayNext(ms: number, count = 1): void {
    this.delayMs = ms;
    this.delayCount = count;
  }

  /// Провайдер получил оплату (сценарий «успех» и «поздний успех»).
  succeed(paymentId: string): void {
    this.ledger.setStatus(paymentId, 'succeeded');
  }

  /// Провайдер зафиксировал отказ.
  fail(paymentId: string): void {
    this.ledger.setStatus(paymentId, 'failed');
  }

  countRequests(method: string, pathPrefix: string): number {
    return this.requests.filter(
      (r) => r.method === method && r.path.startsWith(pathPrefix),
    ).length;
  }

  /// Подписанный вебхук провайдера; сумма и валюта по платежу в мок-сервере,
  /// если не переопределены.
  webhook(
    secret: string,
    paymentId: string,
    status: 'succeeded' | 'failed',
    orderNumber: string,
    over: { amount?: string; currency?: string; timestamp?: number } = {},
  ): SignedWebhook {
    const known = this.ledger.getStatus(paymentId);
    return signPaymentWebhook(
      secret,
      {
        orderNumber,
        paymentId,
        status,
        amount: over.amount ?? known.amount.toFixed(2),
        currency: over.currency ?? known.currency,
      },
      over.timestamp,
    );
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const method = req.method ?? 'GET';
    const path = (req.url ?? '/').split('?')[0];
    const idemHeader = req.headers['idempotency-key'];
    const idempotencyKey = Array.isArray(idemHeader)
      ? idemHeader[0]
      : idemHeader;
    this.requests.push({ method, path, idempotencyKey });
    const body = await readBody(req);

    if (this.delayCount > 0) {
      this.delayCount -= 1;
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    if (this.failures.count > 0) {
      this.failures.count -= 1;
      return send(res, this.failures.status, { error: 'unavailable' });
    }
    if (
      this.options.apiKey &&
      req.headers.authorization !== `Bearer ${this.options.apiKey}`
    ) {
      return send(res, 401, { error: 'unauthorized' });
    }

    try {
      const parts = path.split('/').filter(Boolean);
      if (method === 'POST' && parts.length === 1 && parts[0] === 'payments') {
        return send(res, 200, this.createPayment(body, idempotencyKey));
      }
      if (method === 'GET' && parts.length === 2 && parts[0] === 'payments') {
        return send(res, 200, serializeStatus(this.ledger.getStatus(parts[1])));
      }
      if (
        method === 'POST' &&
        parts.length === 3 &&
        parts[0] === 'payments' &&
        parts[2] === 'refunds'
      ) {
        const refund = this.ledger.refund(
          parts[1],
          parseAmount(body.amount),
          idempotencyKey ?? '',
        );
        return send(res, 200, {
          refundId: refund.refundId,
          paymentId: refund.paymentId,
          status: refund.status,
          amount: refund.amount.toFixed(2),
          currency: refund.currency,
        });
      }
      return send(res, 404, { error: 'not_found' });
    } catch (error) {
      if (error instanceof PaymentProviderError) {
        const status =
          error.code === 'not_found'
            ? 404
            : error.code === 'rejected'
              ? 400
              : 409;
        return send(res, status, { error: error.code, detail: error.message });
      }
      return send(res, 400, { error: 'bad_request' });
    }
  }

  private createPayment(
    body: Record<string, unknown>,
    idempotencyKey: string | undefined,
  ) {
    if (!idempotencyKey) {
      throw new PaymentProviderError('rejected', 'idempotency_key_required');
    }
    const orderNumber = String(body.orderNumber ?? '');
    const amount = parseAmount(body.amount);
    const currency = String(body.currency ?? 'RUB');
    const fingerprint = `${orderNumber}|${amount.toFixed(2)}|${currency}`;
    const known = this.createdByKey.get(idempotencyKey);
    if (known) {
      if (known.fingerprint !== fingerprint) {
        throw new PaymentProviderError('rejected', 'idempotency_key_reused');
      }
      return { paymentId: known.paymentId, paymentUrl: null };
    }
    const paymentId = `mock_${++this.seq}_${orderNumber}`;
    this.ledger.create(paymentId, orderNumber, amount, currency);
    this.createdByKey.set(idempotencyKey, { paymentId, fingerprint });
    return { paymentId, paymentUrl: null };
  }
}

function parseAmount(value: unknown): Prisma.Decimal {
  const text = String(value ?? '');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) {
    throw new PaymentProviderError('rejected', 'amount_invalid');
  }
  return new Prisma.Decimal(text);
}

function serializeStatus(s: ReturnType<InMemoryPaymentLedger['getStatus']>) {
  return {
    paymentId: s.paymentId,
    status: s.status,
    amount: s.amount.toFixed(2),
    currency: s.currency,
    refundedAmount: s.refundedAmount.toFixed(2),
  };
}

function send(res: ServerResponse, status: number, payload: unknown): void {
  const json = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(json),
  });
  res.end(json);
}

async function readBody(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
