import { ConfigService } from '@nestjs/config';
import { signPaymentWebhook } from '../../../../test/helpers/sign-payment-webhook';
import {
  MIN_WEBHOOK_SECRET_LENGTH,
  readWebhookSecrets,
  verifySignedWebhook,
} from './webhook-signature';

const CURRENT = 'c'.repeat(MIN_WEBHOOK_SECRET_LENGTH);
const PREVIOUS = 'p'.repeat(MIN_WEBHOOK_SECRET_LENGTH);
const NOW = new Date('2026-01-01T12:00:00Z');
const nowSec = Math.floor(NOW.getTime() / 1000);
const event = {
  orderNumber: 'O-1',
  paymentId: 'p-1',
  status: 'succeeded',
  amount: '270.00',
  currency: 'RUB',
};

function config(values: Record<string, string | undefined>) {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('readWebhookSecrets (ADR-0187)', () => {
  it('короткий секрет считается незаданным', () => {
    expect(
      readWebhookSecrets(
        config({
          PAYMENT_WEBHOOK_SECRET: 'x'.repeat(MIN_WEBHOOK_SECRET_LENGTH - 1),
        }),
      ),
    ).toEqual([]);
  });

  it('секрет минимальной длины принимается', () => {
    expect(
      readWebhookSecrets(config({ PAYMENT_WEBHOOK_SECRET: CURRENT })),
    ).toEqual([CURRENT]);
  });

  it('на время ротации действуют текущий и предыдущий', () => {
    expect(
      readWebhookSecrets(
        config({
          PAYMENT_WEBHOOK_SECRET: CURRENT,
          PAYMENT_WEBHOOK_SECRET_PREVIOUS: PREVIOUS,
        }),
      ),
    ).toEqual([CURRENT, PREVIOUS]);
  });

  it('пусто и не задано — пустой список', () => {
    expect(readWebhookSecrets(config({}))).toEqual([]);
    expect(
      readWebhookSecrets(
        config({
          PAYMENT_WEBHOOK_SECRET: '',
          PAYMENT_WEBHOOK_SECRET_PREVIOUS: '',
        }),
      ),
    ).toEqual([]);
  });
});

describe('verifySignedWebhook: ротация секрета (ADR-0187)', () => {
  const both = [CURRENT, PREVIOUS];

  it('подписи текущим и предыдущим секретом принимаются', () => {
    for (const secret of both) {
      const signed = signPaymentWebhook(secret, event, nowSec);
      expect(
        verifySignedWebhook(
          both,
          Buffer.from(signed.rawBody),
          signed.headers,
          NOW,
        )?.orderNumber,
      ).toBe('O-1');
    }
  });

  it('после ротации (предыдущий снят) старая подпись отклоняется', () => {
    const signed = signPaymentWebhook(PREVIOUS, event, nowSec);
    expect(
      verifySignedWebhook(
        [CURRENT],
        Buffer.from(signed.rawBody),
        signed.headers,
        NOW,
      ),
    ).toBeNull();
  });

  it('посторонний секрет отклоняется, пустой список секретов — всегда отказ', () => {
    const signed = signPaymentWebhook('z'.repeat(40), event, nowSec);
    expect(
      verifySignedWebhook(
        both,
        Buffer.from(signed.rawBody),
        signed.headers,
        NOW,
      ),
    ).toBeNull();
    const own = signPaymentWebhook(CURRENT, event, nowSec);
    expect(
      verifySignedWebhook([], Buffer.from(own.rawBody), own.headers, NOW),
    ).toBeNull();
  });
});
