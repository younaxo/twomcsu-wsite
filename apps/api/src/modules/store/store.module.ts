import { Module } from '@nestjs/common';
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
import { PaymentProviderRegistry } from './payment/payment-provider.registry';
import { TestPaymentProvider } from './payment/test-payment-provider.service';
import { PaymentsWebhookController } from './payments-webhook.controller';
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
    StoreStatsService,
    PaymentProviderRegistry,
    TestPaymentProvider,
  ],
  exports: [OrdersService, StoreStatsService],
})
export class StoreModule {}
