import { ConfigService } from '@nestjs/config';
import { MockHttpPaymentProvider } from './mock-http-payment-provider.service';
import { PaymentProviderRegistry } from './payment-provider.registry';
import { PaymentRouter } from './payment-router.service';
import { TestPaymentProvider } from './test-payment-provider.service';

const SECRET = 'router-unit-secret-0123456789abcdefgh';
const ALL =
  'SBP:mock-ru,CARD_RU:mock-ru,SBERPAY:mock-ru,CRYPTO:mock-crypto,CARD_FOREIGN:mock-foreign';

function router(values: Record<string, string | undefined>) {
  const config = { get: (k: string) => values[k] } as unknown as ConfigService;
  const registry = new PaymentProviderRegistry(
    config,
    new TestPaymentProvider(config),
    new MockHttpPaymentProvider(config),
  );
  return new PaymentRouter(config, registry);
}

const dev = (extra: Record<string, string | undefined> = {}) =>
  router({ NODE_ENV: 'test', PAYMENT_WEBHOOK_SECRET: SECRET, ...extra });

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { getResponse: () => { code: string } }).getResponse().code;
  }
  return undefined;
}

describe('PaymentRouter (0.8b, ADR-0193)', () => {
  it('listEnabled: только включённые, публичные поля, порядок конфигурации', () => {
    const r = dev({ PAYMENT_METHODS: 'CRYPTO:mock-crypto,SBP:mock-ru' });
    expect(r.listEnabled()).toEqual([
      { code: 'CRYPTO', title: 'Криптовалюта', currency: 'RUB' },
      { code: 'SBP', title: 'СБП', currency: 'RUB' },
    ]);
    expect(JSON.stringify(r.listEnabled())).not.toContain('mock-');
  });

  it('маршрутизация: способ -> провайдер из конфигурации', () => {
    const r = dev({ PAYMENT_METHODS: ALL });
    const expected: Record<string, string> = {
      SBP: 'mock-ru',
      CARD_RU: 'mock-ru',
      SBERPAY: 'mock-ru',
      CRYPTO: 'mock-crypto',
      CARD_FOREIGN: 'mock-foreign',
    };
    for (const [method, name] of Object.entries(expected)) {
      const res = r.resolve(method);
      expect(res.provider.name).toBe(name);
      expect(res.method).toBe(method);
    }
  });

  it('провайдер без поддержки способа: способ недоступен, а не уходит не туда', () => {
    const bad = dev({ PAYMENT_METHODS: 'SBP:mock-crypto' });
    expect(code(() => bad.resolve('SBP'))).toBe('payment_method_unavailable');
    expect(bad.listEnabled()).toEqual([]);
  });

  it('коды ошибок: required / invalid / unavailable', () => {
    const r = dev({ PAYMENT_METHODS: 'SBP:mock-ru' });
    expect(code(() => r.resolve(undefined))).toBe('payment_method_required');
    expect(code(() => r.resolve(''))).toBe('payment_method_required');
    expect(code(() => r.resolve('BITCOIN'))).toBe('payment_method_invalid');
    expect(code(() => r.resolve('sbp'))).toBe('payment_method_invalid');
    expect(code(() => r.resolve('CRYPTO'))).toBe('payment_method_unavailable');
  });

  it('без маршрутов: устаревший путь PAYMENT_PROVIDER, способ необязателен', () => {
    const r = dev({ PAYMENT_METHODS: '' });
    const res = r.resolve(undefined);
    expect(res.provider.name).toBe('test');
    expect(res.method).toBeNull();
    expect(r.isPaymentAvailable()).toBe(true);
    expect(r.listEnabled()).toEqual([]);
    expect(code(() => r.resolve('SBP'))).toBe('payment_method_unavailable');
  });

  it('без секрета вебхука провайдер не настроен: 503 / способ недоступен', () => {
    const r = router({ NODE_ENV: 'test', PAYMENT_METHODS: ALL });
    expect(r.listEnabled()).toEqual([]);
    expect(r.isPaymentAvailable()).toBe(false);
    expect(code(() => r.resolve('SBP'))).toBe('payment_method_unavailable');
    expect(code(() => r.resolve(undefined))).toBe('payment_unavailable');
  });

  it.each(['', 'production', 'staging', 'Test', undefined])(
    'NODE_ENV=%p: моков нет, способов нет, fail closed',
    (env) => {
      const r = router({
        NODE_ENV: env,
        PAYMENT_WEBHOOK_SECRET: SECRET,
        PAYMENT_METHODS: ALL,
      });
      expect(r.listEnabled()).toEqual([]);
      expect(r.isPaymentAvailable()).toBe(false);
      expect(code(() => r.resolve('SBP'))).toBe('payment_method_unavailable');
      expect(code(() => r.resolve(undefined))).toBe('payment_unavailable');
    },
  );

  it('production без маршрутов: оплата недоступна (503), PAYMENT_PROVIDER не подставляется', () => {
    const r = router({
      NODE_ENV: 'production',
      PAYMENT_WEBHOOK_SECRET: SECRET,
    });
    expect(r.isPaymentAvailable()).toBe(false);
    expect(code(() => r.resolve(undefined))).toBe('payment_unavailable');
  });
});
