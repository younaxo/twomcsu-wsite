import { Module } from '@nestjs/common';
import { TwoFactorService } from '../auth/two-factor/two-factor.service';
import { DeliveryModule } from '../delivery/delivery.module';
import { WalletModule } from '../wallet/wallet.module';
import { BundlesAdminController } from './bundles-admin.controller';
import { BundlesController } from './bundles.controller';
import { BundlesService } from './bundles.service';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CategoriesAdminController } from './categories-admin.controller';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CurrenciesAdminController } from './currencies-admin.controller';
import { CurrenciesController } from './currencies.controller';
import { CurrenciesService } from './currencies.service';
import { DiscountsAdminController } from './discounts-admin.controller';
import { DiscountsController } from './discounts.controller';
import { DiscountsService } from './discounts.service';
import { OrdersAdminController } from './orders-admin.controller';
import { OrdersController, StoreExtrasController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CheckoutPolicyService } from './checkout-policy.service';
import { PaidRemovalService } from './paid-removal.service';
import { NickResolver } from './nick-resolver.service';
import { QuickBuyDenialLimiter } from './quick-buy-denial-limiter.service';
import { PaymentProviderRegistry } from './payment/payment-provider.registry';
import { TestPaymentProvider } from './payment/test-payment-provider.service';
import { MockHttpPaymentProvider } from './payment/mock-http-payment-provider.service';
import { PaymentRouter } from './payment/payment-router.service';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { RefundsAdminController } from './refunds-admin.controller';
import { RefundsService } from './refunds.service';
import { DeliveryTemplatesAdminController } from './delivery-templates-admin.controller';
import { DeliveryTemplatesService } from './delivery-templates.service';
import {
  StoreSettingsAdminController,
  StoreTextsController,
} from './store-settings.controller';
import { StoreSettingsService } from './store-settings.service';
import { StoreReconcileScheduler } from './store-reconcile.scheduler';
import { StoreReconcileService } from './store-reconcile.service';
import { PricingService } from './pricing.service';
import { PromocodesAdminController } from './promocodes-admin.controller';
import { PromocodesController } from './promocodes.controller';
import { PromocodesService } from './promocodes.service';
import { ProductsAdminController } from './products-admin.controller';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { StoreStatsAdminController } from './stats-admin.controller';
import { StoreStatsService } from './stats.service';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';

@Module({
  imports: [DeliveryModule, WalletModule],
  controllers: [
    CategoriesController,
    CategoriesAdminController,
    ProductsController,
    ProductsAdminController,
    BundlesController,
    BundlesAdminController,
    DiscountsController,
    DiscountsAdminController,
    CurrenciesController,
    CurrenciesAdminController,
    PromocodesController,
    PromocodesAdminController,
    CartController,
    WishlistController,
    OrdersController,
    StoreExtrasController,
    OrdersAdminController,
    RefundsAdminController,
    DeliveryTemplatesAdminController,
    StoreSettingsAdminController,
    StoreTextsController,
    PaymentsWebhookController,
    StoreStatsAdminController,
  ],
  providers: [
    CategoriesService,
    ProductsService,
    BundlesService,
    DiscountsService,
    CurrenciesService,
    PromocodesService,
    PricingService,
    CartService,
    WishlistService,
    OrdersService,
    NickResolver,
    QuickBuyDenialLimiter,
    CheckoutPolicyService,
    PaidRemovalService,
    StoreStatsService,
    PaymentProviderRegistry,
    TestPaymentProvider,
    MockHttpPaymentProvider,
    PaymentRouter,
    // Свой экземпляр: AuthModule не экспортирует TwoFactorService (ADR-0188).
    TwoFactorService,
    RefundsService,
    DeliveryTemplatesService,
    StoreSettingsService,
    StoreReconcileService,
    StoreReconcileScheduler,
  ],
  exports: [OrdersService, StoreStatsService, PaidRemovalService],
})
export class StoreModule {}
