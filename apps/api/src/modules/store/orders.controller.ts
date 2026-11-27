import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ListMyOrdersQueryDto } from './dto/list-my-orders-query.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateOrderDto } from './dto/create-order.dto';
import { GuestOrderLookupDto } from './dto/guest-order-lookup.dto';
import { QuickBuyDto } from './dto/quick-buy.dto';
import { OrdersService } from './orders.service';
import { QuickBuyDenialLimiter } from './quick-buy-denial-limiter.service';
import { PaymentRouter } from './payment/payment-router.service';
import { Throttle } from '@nestjs/throttler';
import { StoreCheckoutError } from './store-errors';
import { SiteModule } from '../system/site-module.decorator';

function isNickDenial(error: unknown): boolean {
  if (!(error instanceof HttpException)) return false;
  const body = error.getResponse();
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { code?: unknown }).code === StoreCheckoutError.NICK_UNAVAILABLE
  );
}

@SiteModule('store')
@Controller('store')
export class StoreExtrasController {
  constructor(
    private readonly orders: OrdersService,
    private readonly paymentRouter: PaymentRouter,
    private readonly denials: QuickBuyDenialLimiter,
  ) {}

  @Get('recent-purchases')
  async recentPurchases() {
    return this.orders.recentPurchases();
  }

  /// Включённые способы оплаты (0.8b, ADR-0193): только публичные поля
  /// (код, название, валюта), без провайдера и конфигурации. Пусто — способы
  /// не настроены (работает устаревший путь без выбора).
  @Get('payment-methods')
  paymentMethods() {
    return { methods: this.paymentRouter.listEnabled() };
  }

  @Get('checkout-config')
  async checkoutConfig() {
    return this.orders.checkoutConfig();
  }

  /// Анонимный: без лимита любой может плодить PENDING-заказы (SEC-07, ADR-0157).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('quick-buy')
  async quickBuy(
    @Body() dto: QuickBuyDto,
    @Req() req: { ip?: string; socket?: { remoteAddress?: string } },
  ) {
    // Порядок: флаг -> лимит отказов по IP (ADR-0186 Р1) -> остальное.
    this.orders.assertQuickBuyEnabled();
    const ip = req.ip ?? req.socket?.remoteAddress;
    await this.denials.assertAllowed(ip);
    try {
      return await this.orders.quickBuy(dto);
    } catch (error) {
      if (isNickDenial(error)) {
        await this.denials.recordDenial(ip);
      }
      throw error;
    }
  }

  /// Страница заказа без входа (0.12a, ADR-0190): токен в теле, ответ без кэша и
  /// без Referer. Лимит 60/мин на IP (ADR-0186 п. 4); перебор 128-битного токена
  /// невозможен, лимит защищает от нагрузки.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @Post('orders/guest/lookup')
  async guestOrder(@Body() dto: GuestOrderLookupDto) {
    return this.orders.getByGuestToken(dto.token);
  }
}

@SiteModule('store')
@Controller('store/orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
  ) {
    return this.orders.createFromCart(user.id, dto);
  }

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListMyOrdersQueryDto,
  ) {
    return this.orders.listMine(user.id, query);
  }

  @Get(':orderNumber')
  async getByNumber(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderNumber') orderNumber: string,
  ) {
    return this.orders.getByOrderNumber(orderNumber, user.id);
  }
}
