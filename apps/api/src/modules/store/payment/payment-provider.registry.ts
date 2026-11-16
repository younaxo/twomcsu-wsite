import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProvider } from './payment-provider.interface';
import { TestPaymentProvider } from './test-payment-provider.service';

/// Окружения, где допустим `TestPaymentProvider` (ADR-0157). Всё остальное
/// (production, staging, неизвестное) — без тестового провайдера.
const TEST_PROVIDER_ENVS = new Set(['development', 'test']);

/// `TestPaymentProvider` регистрируется только при NODE_ENV in
/// {development, test} (ADR-0009, ADR-0157) — иначе реестр пуст, пока не
/// появится реальный провайдер (RISKS.md R2).
@Injectable()
export class PaymentProviderRegistry {
  private readonly providers = new Map<string, PaymentProvider>();

  constructor(
    private readonly config: ConfigService,
    testProvider: TestPaymentProvider,
  ) {
    if (TEST_PROVIDER_ENVS.has(this.config.get<string>('NODE_ENV') ?? '')) {
      this.providers.set(testProvider.name, testProvider);
    }
  }

  get(name: string): PaymentProvider | undefined {
    return this.providers.get(name);
  }

  getConfigured(): PaymentProvider | undefined {
    return this.get(this.config.get<string>('PAYMENT_PROVIDER') ?? 'test');
  }
}
