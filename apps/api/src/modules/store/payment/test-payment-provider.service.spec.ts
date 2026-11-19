import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { signPaymentWebhook } from '../../../../test/helpers/sign-payment-webhook';
import { TestPaymentProvider } from './test-payment-provider.service';

const SECRET = 'unit-test-webhook-secret-0123456789ab';
const NOW = new Date('2026-01-01T12:00:00Z');
const nowSec = Math.floor(NOW.getTime() / 1000);
const event = {
  orderNumber: 'O-1',
  paymentId: 'p-1',
  status: 'succeeded',
  amount: '270.00',
  currency: 'RUB',
};

function provider(secret: string | undefined = SECRET) {
  const config = {
    get: (key: string) =>
      key === 'PAYMENT_WEBHOOK_SECRET' ? secret : undefined,
  } as unknown as ConfigService;
  return new TestPaymentProvider(config);
}

function verify(
  p: TestPaymentProvider,
  signed: ReturnType<typeof signPaymentWebhook>,
  raw: string = signed.rawBody,
) {
  return p.verifyWebhook(Buffer.from(raw), signed.headers, NOW);
}

describe('TestPaymentProvider.verifyWebhook (ADR-0157)', () => {
  it('валидная подпись возвращает событие', () => {
    const e = verify(provider(), signPaymentWebhook(SECRET, event, nowSec));
    expect(e).not.toBeNull();
    expect(e?.orderNumber).toBe('O-1');
    expect(e?.amount.toString()).toBe('270');
    expect(e?.currency).toBe('RUB');
  });

  it('чужой секрет отклоняется', () => {
    expect(verify(provider(), signPaymentWebhook('other', event, nowSec))).toBe(
      null,
    );
  });

  it('изменённый байт тела отклоняется', () => {
    const signed = signPaymentWebhook(SECRET, event, nowSec);
    expect(
      verify(provider(), signed, signed.rawBody.replace('O-1', 'O-2')),
    ).toBe(null);
  });

  it('подпись над другим форматированием JSON не подходит к сырому телу', () => {
    const compact = JSON.stringify(event);
    const pretty = JSON.stringify(event, null, 2);
    const signedCompact = signPaymentWebhook(SECRET, compact, nowSec);
    expect(verify(provider(), signedCompact, pretty)).toBeNull();
  });

  it('timestamp вне окна +-5 минут отклоняется, на границе принимается', () => {
    const p = provider();
    expect(
      verify(p, signPaymentWebhook(SECRET, event, nowSec - 301)),
    ).toBeNull();
    expect(
      verify(p, signPaymentWebhook(SECRET, event, nowSec + 301)),
    ).toBeNull();
    expect(
      verify(p, signPaymentWebhook(SECRET, event, nowSec - 300)),
    ).not.toBeNull();
    expect(
      verify(p, signPaymentWebhook(SECRET, event, nowSec + 300)),
    ).not.toBeNull();
  });

  it('пустой или незаданный секрет отклоняет даже подпись пустым ключом', () => {
    expect(
      verify(provider(''), signPaymentWebhook('', event, nowSec)),
    ).toBeNull();
    expect(
      verify(provider(undefined), signPaymentWebhook('', event, nowSec)),
    ).toBeNull();
  });

  it('нет заголовков или raw body — отказ', () => {
    const p = provider();
    const signed = signPaymentWebhook(SECRET, event, nowSec);
    expect(p.verifyWebhook(Buffer.from(signed.rawBody), {}, NOW)).toBeNull();
    expect(
      p.verifyWebhook(
        Buffer.from(signed.rawBody),
        { 'x-twomc-timestamp': signed.headers['x-twomc-timestamp'] },
        NOW,
      ),
    ).toBeNull();
    expect(p.verifyWebhook(undefined, signed.headers, NOW)).toBeNull();
  });

  it('подпись неверной длины/не hex — отказ без исключения', () => {
    const p = provider();
    const signed = signPaymentWebhook(SECRET, event, nowSec);
    for (const bad of ['abc', 'zz'.repeat(32), '']) {
      expect(
        p.verifyWebhook(
          Buffer.from(signed.rawBody),
          { ...signed.headers, 'x-twomc-signature': bad },
          NOW,
        ),
      ).toBeNull();
    }
  });

  it('подписанное, но невалидное событие — отказ', () => {
    const p = provider();
    expect(
      verify(p, signPaymentWebhook(SECRET, 'not json', nowSec)),
    ).toBeNull();
    expect(
      verify(p, signPaymentWebhook(SECRET, { ...event, status: 'x' }, nowSec)),
    ).toBeNull();
    expect(
      verify(p, signPaymentWebhook(SECRET, { ...event, amount: '-1' }, nowSec)),
    ).toBeNull();
  });
});

describe('TestPaymentProvider: настройка, статус, возврат (ADR-0187)', () => {
  const D = (v: string) => new Prisma.Decimal(v);

  it('isConfigured: короткий и пустой секрет — нет, достаточный — да', () => {
    expect(provider().isConfigured()).toBe(true);
    expect(provider('short').isConfigured()).toBe(false);
    expect(provider('').isConfigured()).toBe(false);
    const unset = { get: () => undefined } as unknown as ConfigService;
    expect(new TestPaymentProvider(unset).isConfigured()).toBe(false);
  });

  it('ротация: подпись предыдущим секретом принимается, пока он задан', () => {
    const previous = 'previous-secret-0123456789abcdefghij';
    const config = {
      get: (key: string) =>
        key === 'PAYMENT_WEBHOOK_SECRET'
          ? SECRET
          : key === 'PAYMENT_WEBHOOK_SECRET_PREVIOUS'
            ? previous
            : undefined,
    } as unknown as ConfigService;
    const p = new TestPaymentProvider(config);
    expect(
      verify(p, signPaymentWebhook(previous, event, nowSec)),
    ).not.toBeNull();
    expect(verify(p, signPaymentWebhook(SECRET, event, nowSec))).not.toBeNull();
  });

  it('статус и возврат по платежу: оплата вебхуком, частичный и полный возврат', async () => {
    const p = provider();
    const created = await p.createPayment('O-9', D('100'), 'x');
    expect((await p.getPaymentStatus(created.paymentId)).status).toBe(
      'pending',
    );
    await expect(
      p.refund(created.paymentId, D('1'), 'k0'),
    ).rejects.toMatchObject({ code: 'refund_not_allowed' });
    const paidEvent = {
      ...event,
      paymentId: created.paymentId,
      amount: '100.00',
    };
    expect(
      verify(p, signPaymentWebhook(SECRET, paidEvent, nowSec)),
    ).not.toBeNull();
    expect((await p.getPaymentStatus(created.paymentId)).status).toBe(
      'succeeded',
    );
    await p.refund(created.paymentId, D('40'), 'k1');
    const repeat = await p.refund(created.paymentId, D('40'), 'k1');
    expect(repeat.amount.toString()).toBe('40');
    await p.refund(created.paymentId, D('60'), 'k2');
    expect((await p.getPaymentStatus(created.paymentId)).status).toBe(
      'refunded',
    );
  });

  it('поздний succeeded после failed обновляет статус у провайдера', async () => {
    const p = provider();
    const created = await p.createPayment('O-10', D('50'), 'x');
    const base = { ...event, paymentId: created.paymentId, amount: '50.00' };
    verify(
      p,
      signPaymentWebhook(SECRET, { ...base, status: 'failed' }, nowSec),
    );
    expect((await p.getPaymentStatus(created.paymentId)).status).toBe('failed');
    verify(p, signPaymentWebhook(SECRET, base, nowSec));
    expect((await p.getPaymentStatus(created.paymentId)).status).toBe(
      'succeeded',
    );
  });
});
