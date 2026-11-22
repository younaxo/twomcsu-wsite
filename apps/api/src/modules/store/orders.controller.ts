import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
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
import { Throttle } from '@nestjs/throttler';
import { SiteModule } from '../system/site-module.decorator';

@SiteModule('store')
@Controller('store')
export class StoreExtrasController {
  constructor(private readonly orders: OrdersService) {}

  @Get('recent-purchases')
  async recentPurchases() {
    return this.orders.recentPurchases();
  }

  @Get('checkout-config')
  async checkoutConfig() {
    return this.orders.checkoutConfig();
  }

  /// Анонимный: без лимита любой может плодить PENDING-заказы (SEC-07, ADR-0157).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('quick-buy')
  async quickBuy(@Body() dto: QuickBuyDto) {
    return this.orders.quickBuy(dto);
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
