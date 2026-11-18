import { ConfigService } from '@nestjs/config';
import {
  assertDevOrTestEnv,
  buildSimRequest,
} from '../../../../scripts/payment-webhook-sim';
import { TestPaymentProvider } from './test-payment-provider.service';

const SECRET = 'unit-sim-secret';

describe('payment-webhook-sim', () => {
  it.each([undefined, '', 'production', 'staging'])(
    'NODE_ENV=%p — отказ',
    (env) => {
      expect(() => assertDevOrTestEnv(env)).toThrow();
    },
  );

  it.each(['development', 'test'])('NODE_ENV=%s — разрешено', (env) => {
    expect(() => assertDevOrTestEnv(env)).not.toThrow();
  });

  it('пустой секрет — ошибка без печати значений', () => {
    expect(() =>
      buildSimRequest({
        secret: '',
        status: 'succeeded',
        orderNumber: 'O-1',
        amount: '10.00',
        currency: 'RUB',
      }),
    ).toThrow('PAYMENT_WEBHOOK_SECRET не задан');
  });

  it.each(['succeeded', 'failed'] as const)(
    'подпись (%s) принимается проверкой провайдера',
    (status) => {
      const now = Math.floor(Date.now() / 1000);
      const req = buildSimRequest({
        secret: SECRET,
        status,
        orderNumber: 'O-1',
        amount: '270.00',
        currency: 'RUB',
        nowSeconds: now,
      });
      const config = {
        get: (key: string) =>
          key === 'PAYMENT_WEBHOOK_SECRET' ? SECRET : undefined,
      } as unknown as ConfigService;
      const event = new TestPaymentProvider(config).verifyWebhook(
        Buffer.from(req.rawBody),
        req.headers,
      );
      expect(event?.status).toBe(status);
      expect(event?.orderNumber).toBe('O-1');
      expect(event?.amount.toString()).toBe('270');
      expect(req.path).toBe('/webhooks/payments/test');
    },
  );
});
