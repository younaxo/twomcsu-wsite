import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  paymentMethodInvalid,
  paymentMethodRequired,
  paymentMethodUnavailable,
  paymentUnavailable,
} from '../store-errors';
import {
  isPaymentMethodCode,
  PAYMENT_METHOD_TITLES,
  PaymentMethodCode,
  parsePaymentMethodRoutes,
} from './payment-methods';
import { PaymentProvider } from './payment-provider.interface';
import { PaymentProviderRegistry } from './payment-provider.registry';

export interface PublicPaymentMethod {
  code: PaymentMethodCode;
  title: string;
  currency: string;
}

export interface ResolvedPayment {
  provider: PaymentProvider;
  /// null — способ не выбран (устаревший путь: PAYMENT_PROVIDER без маршрутов).
  method: PaymentMethodCode | null;
}

/// Маршрутизатор способов оплаты (0.8b, ADR-0193). Конфигурация —
/// `PAYMENT_METHODS=SBP:mock-ru,CRYPTO:mock-crypto`: запись одновременно
/// включает способ и задаёт его провайдера. Способ доступен только если
/// провайдер есть в реестре (в production моков нет), настроен и поддерживает
/// способ. Fail closed: пустая конфигурация -> нет способов.
@Injectable()
export class PaymentRouter {
  constructor(
    private readonly config: ConfigService,
    private readonly registry: PaymentProviderRegistry,
  ) {}

  private routes() {
    return parsePaymentMethodRoutes(this.config.get<string>('PAYMENT_METHODS'));
  }

  private providerFor(
    method: PaymentMethodCode,
    providerName: string,
  ): PaymentProvider | undefined {
    const provider = this.registry.get(providerName);
    if (!provider || !provider.isConfigured()) {
      return undefined;
    }
    if (
      provider.supportedMethods &&
      !provider.supportedMethods.includes(method)
    ) {
      return undefined;
    }
    return provider;
  }

  /// Включённые и рабочие способы; только публичные поля (без имени провайдера).
  listEnabled(): PublicPaymentMethod[] {
    const result: PublicPaymentMethod[] = [];
    for (const route of this.routes()) {
      const provider = this.providerFor(route.method, route.provider);
      if (provider) {
        result.push({
          code: route.method,
          title: PAYMENT_METHOD_TITLES[route.method],
          currency: provider.currency,
        });
      }
    }
    return result;
  }

  /// Есть ли чем платить: способы маршрутизатора либо устаревший провайдер.
  isPaymentAvailable(): boolean {
    return (
      this.listEnabled().length > 0 ||
      (this.routes().length === 0 &&
        this.registry.getConfigured() !== undefined)
    );
  }

  /// Выбор провайдера для оформления. Бросает 4xx/503 ДО любой записи.
  /// - маршруты не заданы: устаревший путь (`PAYMENT_PROVIDER`), способ
  ///   необязателен; явно указанный способ отвергается
  ///   (`payment_method_unavailable`);
  /// - маршруты заданы: способ обязателен, неизвестный ->
  ///   `payment_method_invalid`, выключенный/без рабочего провайдера ->
  ///   `payment_method_unavailable`.
  resolve(method: string | undefined | null): ResolvedPayment {
    const routes = this.routes();
    const requested = method?.trim() ? method.trim() : undefined;
    if (requested !== undefined && !isPaymentMethodCode(requested)) {
      throw paymentMethodInvalid();
    }
    if (routes.length === 0) {
      if (requested !== undefined) {
        throw paymentMethodUnavailable();
      }
      const legacy = this.registry.getConfigured();
      if (!legacy) {
        throw paymentUnavailable();
      }
      return { provider: legacy, method: null };
    }
    if (requested === undefined) {
      if (this.listEnabled().length === 0) {
        throw paymentUnavailable();
      }
      throw paymentMethodRequired();
    }
    const route = routes.find((r) => r.method === requested);
    const provider = route
      ? this.providerFor(route.method, route.provider)
      : undefined;
    if (!provider) {
      throw paymentMethodUnavailable();
    }
    return { provider, method: requested };
  }
}
