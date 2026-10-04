import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProvider } from './payment-provider.interface';
import { TestPaymentProvider } from './test-payment-provider.service';

/// `TestPaymentProvider` не регистрируется в production (ADR-0009) — реестр
/// в этом случае пуст, пока не появится реальный провайдер (RISKS.md R2).
@Injectable()
export class PaymentProviderRegistry {
  private readonly providers = new Map<string, PaymentProvider>();

  constructor(
    private readonly config: ConfigService,
    testProvider: TestPaymentProvider,
  ) {
    if (this.config.get<string>('NODE_ENV') !== 'production') {
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
