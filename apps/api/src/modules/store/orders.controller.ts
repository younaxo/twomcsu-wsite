import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateOrderDto } from './dto/create-order.dto';
import { QuickBuyDto } from './dto/quick-buy.dto';
import { OrdersService } from './orders.service';

@Controller('store')
export class StoreExtrasController {
  constructor(private readonly orders: OrdersService) {}

  @Get('recent-purchases')
  async recentPurchases() {
    return this.orders.recentPurchases();
  }

  @Post('quick-buy')
  async quickBuy(@Body() dto: QuickBuyDto) {
    return this.orders.quickBuy(dto);
  }
}

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
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.orders.listMine(user.id);
  }

  @Get(':orderNumber')
  async getByNumber(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderNumber') orderNumber: string,
  ) {
    return this.orders.getByOrderNumber(orderNumber, user.id);
  }
}
