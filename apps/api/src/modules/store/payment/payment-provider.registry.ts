import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isProductionLike } from '../../../config/node-env';
import { MockHttpPaymentProvider } from './mock-http-payment-provider.service';
import { PaymentProvider } from './payment-provider.interface';
import { TestPaymentProvider } from './test-payment-provider.service';

/// Окружения, где допустимы `TestPaymentProvider` и `mock-http` (ADR-0157,
/// ADR-0187). Всё остальное (production, staging, неизвестное, пустое) — без
/// них: реестр пуст, пока не появится реальный провайдер (0.8b, RISKS.md R2).
const DEV_PROVIDER_ENVS = new Set(['development', 'test']);

/// Fail closed (ADR-0187): `getConfigured()` отдаёт провайдера только если он
/// зарегистрирован, выбран через `PAYMENT_PROVIDER` и `isConfigured()` (есть
/// секреты и, где нужно, адрес). Иначе `undefined` -> оформление отвечает 503
/// `payment_unavailable`. В production пустой `PAYMENT_PROVIDER` не
/// подставляется значением по умолчанию.
@Injectable()
export class PaymentProviderRegistry {
  private readonly providers = new Map<string, PaymentProvider>();

  constructor(
    private readonly config: ConfigService,
    testProvider: TestPaymentProvider,
    mockHttpProvider?: MockHttpPaymentProvider,
  ) {
    if (DEV_PROVIDER_ENVS.has(this.config.get<string>('NODE_ENV') ?? '')) {
      this.providers.set(testProvider.name, testProvider);
      if (mockHttpProvider) {
        this.providers.set(mockHttpProvider.name, mockHttpProvider);
      }
    }
  }

  get(name: string): PaymentProvider | undefined {
    return this.providers.get(name);
  }

  getConfigured(): PaymentProvider | undefined {
    const selected = (this.config.get<string>('PAYMENT_PROVIDER') ?? '').trim();
    const name =
      selected ||
      (isProductionLike(this.config.get<string>('NODE_ENV')) ? '' : 'test');
    const provider = name ? this.get(name) : undefined;
    return provider?.isConfigured() ? provider : undefined;
  }
}
