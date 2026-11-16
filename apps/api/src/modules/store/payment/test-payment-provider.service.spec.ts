import { ConfigService } from '@nestjs/config';
import { signPaymentWebhook } from '../../../../test/helpers/sign-payment-webhook';
import { TestPaymentProvider } from './test-payment-provider.service';

const SECRET = 'unit-test-webhook-secret';
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
