import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  MOCK_METHOD_PROVIDER_SPECS,
  MockMethodPaymentProvider,
} from './mock-method-payment-provider';
import { computeWebhookSignature } from './webhook-signature';

const SECRET = 'mock-method-unit-secret-0123456789abcd';
const PREVIOUS = 'mock-method-previous-secret-0123456789ab';

type Values = Record<string, string | undefined>;

function provider(
  name: string,
  values: Values = { PAYMENT_WEBHOOK_SECRET: SECRET },
) {
  const config = { get: (k: string) => values[k] } as unknown as ConfigService;
  const spec = MOCK_METHOD_PROVIDER_SPECS.find((s) => s.name === name)!;
  return new MockMethodPaymentProvider(config, spec);
}

function signed(
  secret: string,
  body: Record<string, unknown>,
  now = new Date(),
) {
  const raw = Buffer.from(JSON.stringify(body));
  const ts = String(Math.floor(now.getTime() / 1000));
  return {
    raw,
    headers: {
      'x-twomc-signature': computeWebhookSignature(secret, ts, raw).toString(
        'hex',
      ),
      'x-twomc-timestamp': ts,
    },
  };
}

const eventBody = (paymentId: string, status = 'succeeded') => ({
  orderNumber: 'O-1',
  paymentId,
  status,
  amount: '100.00',
  currency: 'RUB',
});

describe('MockMethodPaymentProvider (0.8b)', () => {
  it('набор моков и поддерживаемые способы', () => {
    expect(
      MOCK_METHOD_PROVIDER_SPECS.map((s) => [s.name, s.supportedMethods]),
    ).toEqual([
      ['mock-ru', ['SBP', 'CARD_RU', 'SBERPAY']],
      ['mock-crypto', ['CRYPTO']],
      ['mock-foreign', ['CARD_FOREIGN']],
    ]);
  });

  it('isConfigured: без секрета (или короче 32) — нет', () => {
    expect(provider('mock-ru', {}).isConfigured()).toBe(false);
    expect(
      provider('mock-ru', { PAYMENT_WEBHOOK_SECRET: 'short' }).isConfigured(),
    ).toBe(false);
    expect(provider('mock-ru').isConfigured()).toBe(true);
  });

  it('createPayment детерминирован и идемпотентен, без сети (paymentUrl null)', async () => {
    const p = provider('mock-crypto');
    const a = await p.createPayment('O-1', new Prisma.Decimal(100), 'x');
    const b = await p.createPayment('O-1', new Prisma.Decimal(100), 'x');
    expect(a).toEqual({ paymentId: 'mockcrypto_O-1', paymentUrl: null });
    expect(b).toEqual(a);
    const status = await p.getPaymentStatus(a.paymentId);
    expect(status.status).toBe('pending');
    expect(status.amount.toString()).toBe('100');
  });

  it('вебхук: общая подпись, оба секрета ротации, чужая/просроченная подпись — null', () => {
    const p = provider('mock-ru', {
      PAYMENT_WEBHOOK_SECRET: SECRET,
      PAYMENT_WEBHOOK_SECRET_PREVIOUS: PREVIOUS,
    });
    const body = eventBody('mockru_O-1');
    for (const secret of [SECRET, PREVIOUS]) {
      const s = signed(secret, body);
      expect(p.verifyWebhook(s.raw, s.headers)?.status).toBe('succeeded');
    }
    const bad = signed('z'.repeat(40), body);
    expect(p.verifyWebhook(bad.raw, bad.headers)).toBeNull();
    const old = signed(SECRET, body, new Date(Date.now() - 3_600_000));
    expect(p.verifyWebhook(old.raw, old.headers)).toBeNull();
    expect(p.verifyWebhook(undefined, {})).toBeNull();
  });

  it('вебхук: повтор не меняет итог, failed после succeeded игнорируется', async () => {
    const p = provider('mock-foreign');
    const ok = signed(SECRET, eventBody('mockforeign_O-1'));
    p.verifyWebhook(ok.raw, ok.headers);
    p.verifyWebhook(ok.raw, ok.headers);
    const fail = signed(SECRET, eventBody('mockforeign_O-1', 'failed'));
    p.verifyWebhook(fail.raw, fail.headers);
    expect((await p.getPaymentStatus('mockforeign_O-1')).status).toBe(
      'succeeded',
    );
  });

  it('возврат: идемпотентный ключ, остаток, не оплачено, неизвестный платёж', async () => {
    const p = provider('mock-ru');
    await p.createPayment('O-2', new Prisma.Decimal(100), 'x');
    await expect(
      p.refund('mockru_O-2', new Prisma.Decimal(10), 'k-notpaid'),
    ).rejects.toMatchObject({ code: 'refund_not_allowed' });
    const s = signed(SECRET, {
      ...eventBody('mockru_O-2'),
      orderNumber: 'O-2',
    });
    p.verifyWebhook(s.raw, s.headers);

    const r1 = await p.refund('mockru_O-2', new Prisma.Decimal(30), 'k1');
    const r2 = await p.refund('mockru_O-2', new Prisma.Decimal(30), 'k1');
    expect(r2.refundId).toBe(r1.refundId);
    await expect(
      p.refund('mockru_O-2', new Prisma.Decimal(31), 'k1'),
    ).rejects.toMatchObject({ code: 'rejected' });
    await expect(
      p.refund('mockru_O-2', new Prisma.Decimal(71), 'k2'),
    ).rejects.toMatchObject({ code: 'refund_not_allowed' });
    await p.refund('mockru_O-2', new Prisma.Decimal(70), 'k3');
    expect((await p.getPaymentStatus('mockru_O-2')).status).toBe('refunded');
    await expect(
      p.refund('nope', new Prisma.Decimal(1), 'k4'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
