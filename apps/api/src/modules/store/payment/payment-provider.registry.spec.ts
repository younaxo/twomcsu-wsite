import { ConfigService } from '@nestjs/config';
import { PaymentProviderRegistry } from './payment-provider.registry';
import { TestPaymentProvider } from './test-payment-provider.service';

function registry(nodeEnv: string | undefined) {
  const config = {
    get: (key: string) => (key === 'NODE_ENV' ? nodeEnv : undefined),
  } as unknown as ConfigService;
  return new PaymentProviderRegistry(config, new TestPaymentProvider(config));
}

describe('PaymentProviderRegistry (ADR-0157)', () => {
  it.each(['development', 'test'])(
    'NODE_ENV=%s: тестовый провайдер есть',
    (env) => {
      const r = registry(env);
      expect(r.get('test')).toBeDefined();
      expect(r.getConfigured()?.name).toBe('test');
    },
  );

  it.each(['production', 'staging', 'weird', undefined])(
    'NODE_ENV=%s: тестового провайдера нет',
    (env) => {
      const r = registry(env);
      expect(r.get('test')).toBeUndefined();
      expect(r.getConfigured()).toBeUndefined();
    },
  );
});
