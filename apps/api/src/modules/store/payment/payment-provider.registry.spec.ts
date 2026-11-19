import { ConfigService } from '@nestjs/config';
import { MockHttpPaymentProvider } from './mock-http-payment-provider.service';
import { PaymentProviderRegistry } from './payment-provider.registry';
import { TestPaymentProvider } from './test-payment-provider.service';

const SECRET = 'registry-unit-secret-0123456789abcd';

function registry(
  nodeEnv: string | undefined,
  extra: Record<string, string | undefined> = {},
) {
  const values: Record<string, string | undefined> = {
    NODE_ENV: nodeEnv,
    ...extra,
  };
  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
  return new PaymentProviderRegistry(
    config,
    new TestPaymentProvider(config),
    new MockHttpPaymentProvider(config),
  );
}

describe('PaymentProviderRegistry (ADR-0157, ADR-0187)', () => {
  it.each(['development', 'test'])(
    'NODE_ENV=%s: тестовый провайдер есть (при наличии секрета)',
    (env) => {
      const r = registry(env, {
        PAYMENT_WEBHOOK_SECRET: SECRET,
        PAYMENT_MOCK_BASE_URL: 'http://127.0.0.1:1',
      });
      expect(r.get('test')).toBeDefined();
      expect(r.get('mock-http')).toBeDefined();
      expect(r.getConfigured()?.name).toBe('test');
    },
  );

  it.each(['', 'staging', 'Test', 'production', 'weird', undefined])(
    'NODE_ENV=%s: тестового провайдера нет, mock-http нет',
    (env) => {
      const r = registry(env, {
        PAYMENT_PROVIDER: 'mock-http',
        PAYMENT_MOCK_BASE_URL: 'http://127.0.0.1:1',
        PAYMENT_WEBHOOK_SECRET: SECRET,
      });
      expect(r.get('test')).toBeUndefined();
      expect(r.get('mock-http')).toBeUndefined();
      expect(r.getConfigured()).toBeUndefined();
    },
  );

  it('production с PAYMENT_PROVIDER=test и секретом: всё равно пусто (fail closed)', () => {
    const r = registry('production', {
      PAYMENT_PROVIDER: 'test',
      PAYMENT_WEBHOOK_SECRET: SECRET,
    });
    expect(r.getConfigured()).toBeUndefined();
  });

  it('dev без секретов: провайдер зарегистрирован, но не настроен -> 503', () => {
    const r = registry('test');
    expect(r.get('test')).toBeDefined();
    expect(r.getConfigured()).toBeUndefined();
    expect(
      registry('test', { PAYMENT_WEBHOOK_SECRET: 'short' }).getConfigured(),
    ).toBeUndefined();
  });

  it('PAYMENT_PROVIDER не задан в dev/test: по умолчанию test; пустой в production — нет', () => {
    expect(
      registry('test', { PAYMENT_WEBHOOK_SECRET: SECRET }).getConfigured()
        ?.name,
    ).toBe('test');
    expect(
      registry('production', {
        PAYMENT_PROVIDER: '',
        PAYMENT_WEBHOOK_SECRET: SECRET,
      }).getConfigured(),
    ).toBeUndefined();
  });

  it('mock-http: нужны loopback-адрес и секрет', () => {
    const ok = registry('test', {
      PAYMENT_PROVIDER: 'mock-http',
      PAYMENT_MOCK_BASE_URL: 'http://127.0.0.1:9999',
      PAYMENT_WEBHOOK_SECRET: SECRET,
    });
    expect(ok.getConfigured()?.name).toBe('mock-http');
    const noUrl = registry('test', {
      PAYMENT_PROVIDER: 'mock-http',
      PAYMENT_WEBHOOK_SECRET: SECRET,
    });
    expect(noUrl.getConfigured()).toBeUndefined();
    const external = registry('test', {
      PAYMENT_PROVIDER: 'mock-http',
      PAYMENT_MOCK_BASE_URL: 'http://example.com',
      PAYMENT_WEBHOOK_SECRET: SECRET,
    });
    expect(external.getConfigured()).toBeUndefined();
  });

  it('неизвестный провайдер: пусто', () => {
    expect(
      registry('test', {
        PAYMENT_PROVIDER: 'yookassa',
        PAYMENT_WEBHOOK_SECRET: SECRET,
      }).getConfigured(),
    ).toBeUndefined();
  });
});
