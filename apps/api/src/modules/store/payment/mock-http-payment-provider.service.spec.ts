import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { MockPaymentProvider } from '../../../../test/helpers/mock-payment-provider';
import {
  MockHttpPaymentProvider,
  parseMockBaseUrl,
} from './mock-http-payment-provider.service';
import { PaymentProviderError } from './payment-provider.errors';

const SECRET = 'mock-http-unit-secret-0123456789abcd';
const D = (v: string) => new Prisma.Decimal(v);
jest.setTimeout(20_000);

function adapter(env: Record<string, string | number | undefined>) {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new MockHttpPaymentProvider(config);
}

async function errorOf(p: Promise<unknown>): Promise<PaymentProviderError> {
  try {
    await p;
  } catch (e) {
    return e as PaymentProviderError;
  }
  throw new Error('ожидалась ошибка');
}

describe('parseMockBaseUrl (только loopback, http)', () => {
  it.each([
    ['http://127.0.0.1:8123', 'http://127.0.0.1:8123'],
    ['http://localhost:9', 'http://localhost:9'],
    ['http://[::1]:9', 'http://[::1]:9'],
  ])('%s допустим', (raw, expected) => {
    expect(parseMockBaseUrl(raw)).toBe(expected);
  });

  it.each([
    undefined,
    '',
    'not a url',
    'https://127.0.0.1:1',
    'http://example.com',
    'http://10.0.0.5:80',
    'http://127.0.0.1.evil.com',
  ])('%p отвергается', (raw) => {
    expect(parseMockBaseUrl(raw)).toBeNull();
  });
});

describe('MockHttpPaymentProvider на мок-сервере (0.8a)', () => {
  let mock: MockPaymentProvider;
  let env: Record<string, string | number | undefined>;
  let provider: MockHttpPaymentProvider;

  beforeEach(async () => {
    mock = new MockPaymentProvider({ apiKey: 'unit-api-key' });
    const url = await mock.start();
    env = {
      PAYMENT_MOCK_BASE_URL: url,
      PAYMENT_API_KEY: 'unit-api-key',
      PAYMENT_WEBHOOK_SECRET: SECRET,
      PAYMENT_HTTP_TIMEOUT_MS: 400,
      PAYMENT_HTTP_RETRIES: 2,
      PAYMENT_HTTP_RETRY_DELAY_MS: 5,
    };
    provider = adapter(env);
  });
  afterEach(async () => {
    await mock.stop();
  });

  it('isConfigured: нужны loopback-адрес и секрет', () => {
    expect(provider.isConfigured()).toBe(true);
    expect(adapter({ ...env, PAYMENT_WEBHOOK_SECRET: '' }).isConfigured()).toBe(
      false,
    );
    expect(
      adapter({
        ...env,
        PAYMENT_MOCK_BASE_URL: 'http://example.com',
      }).isConfigured(),
    ).toBe(false);
  });

  it('успех: платёж, статус pending, затем succeeded', async () => {
    const created = await provider.createPayment('O-1', D('270'), 'Заказ O-1');
    expect(created.paymentId).toMatch(/^mock_/);
    expect((await provider.getPaymentStatus(created.paymentId)).status).toBe(
      'pending',
    );
    mock.succeed(created.paymentId);
    const status = await provider.getPaymentStatus(created.paymentId);
    expect(status.status).toBe('succeeded');
    expect(status.amount.toString()).toBe('270');
    expect(status.currency).toBe('RUB');
  });

  it('отказ и поздний успех: failed, затем succeeded', async () => {
    const { paymentId } = await provider.createPayment('O-2', D('50'), 'x');
    mock.fail(paymentId);
    expect((await provider.getPaymentStatus(paymentId)).status).toBe('failed');
    mock.succeed(paymentId);
    expect((await provider.getPaymentStatus(paymentId)).status).toBe(
      'succeeded',
    );
  });

  it('повтор createPayment с тем же заказом не создаёт второй платёж', async () => {
    const a = await provider.createPayment('O-3', D('10'), 'x');
    const b = await provider.createPayment('O-3', D('10'), 'x');
    expect(b.paymentId).toBe(a.paymentId);
  });

  it('частичный и полный возврат, повтор по ключу, сверх остатка', async () => {
    const { paymentId } = await provider.createPayment('O-4', D('100'), 'x');
    mock.succeed(paymentId);
    const r1 = await provider.refund(paymentId, D('30'), 'rf-1');
    expect(r1.status).toBe('succeeded');
    expect(r1.amount.toString()).toBe('30');
    const again = await provider.refund(paymentId, D('30'), 'rf-1');
    expect(again.refundId).toBe(r1.refundId);
    expect(
      (await errorOf(provider.refund(paymentId, D('70.01'), 'rf-2'))).code,
    ).toBe('refund_not_allowed');
    await provider.refund(paymentId, D('70'), 'rf-3');
    const final = await provider.getPaymentStatus(paymentId);
    expect(final.status).toBe('refunded');
    expect(final.refundedAmount.toString()).toBe('100');
  });

  it('возврат неоплаченного — refund_not_allowed, неизвестного — not_found', async () => {
    const { paymentId } = await provider.createPayment('O-5', D('10'), 'x');
    expect((await errorOf(provider.refund(paymentId, D('1'), 'k'))).code).toBe(
      'refund_not_allowed',
    );
    expect((await errorOf(provider.getPaymentStatus('nope'))).code).toBe(
      'not_found',
    );
  });

  it('временные сбои 5xx повторяются и проходят; идемпотентный ключ в каждом запросе', async () => {
    mock.failNext(2, 503);
    const created = await provider.createPayment('O-6', D('10'), 'x');
    expect(created.paymentId).toMatch(/^mock_/);
    const posts = mock.requests.filter((r) => r.method === 'POST');
    expect(posts).toHaveLength(3);
    expect(new Set(posts.map((r) => r.idempotencyKey))).toEqual(
      new Set(['create:O-6']),
    );
  });

  it('сбои дольше лимита повторов — unavailable (retryable), ровно 1+retries запросов', async () => {
    mock.failNext(10, 500);
    const error = await errorOf(provider.getPaymentStatus('any'));
    expect(error.code).toBe('unavailable');
    expect(error.retryable).toBe(true);
    expect(mock.requests).toHaveLength(3);
  });

  it('таймаут: timeout после повторов, в сообщении нет адреса и ключа', async () => {
    mock.delayNext(1500, 10);
    const error = await errorOf(provider.getPaymentStatus('any'));
    expect(error.code).toBe('timeout');
    expect(error.retryable).toBe(true);
    expect(error.message).not.toContain('127.0.0.1');
    expect(error.message).not.toContain('unit-api-key');
  });

  it('неверный ключ API — rejected без повторов', async () => {
    const bad = adapter({ ...env, PAYMENT_API_KEY: 'wrong' });
    const error = await errorOf(bad.getPaymentStatus('any'));
    expect(error.code).toBe('rejected');
    expect(error.retryable).toBe(false);
    expect(mock.requests).toHaveLength(1);
  });

  it('мок-сервер остановлен — unavailable без утечки адреса', async () => {
    await mock.stop();
    const error = await errorOf(provider.getPaymentStatus('any'));
    expect(error.code).toBe('unavailable');
    expect(error.message).not.toContain('127.0.0.1');
  });

  it('без адреса — not_configured', async () => {
    const none = adapter({ ...env, PAYMENT_MOCK_BASE_URL: '' });
    expect((await errorOf(none.getPaymentStatus('x'))).code).toBe(
      'not_configured',
    );
  });
});
