import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { ListAdminOrdersQueryDto } from './dto/list-admin-orders-query.dto';
import { RefundOrderDto } from './dto/refund-order.dto';
import { OrdersService } from './orders.service';

@Controller('admin/orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrdersAdminController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions('orders.view')
  async list(@Query() query: ListAdminOrdersQueryDto) {
    return this.orders.listAdmin(query);
  }

  @Get('stats')
  @RequirePermissions('orders.stats')
  async stats() {
    return this.orders.stats();
  }

  /// Карточка заказа по id или номеру. Объявлен после `stats`, чтобы
  /// статический маршрут не перехватывался параметром.
  @Get(':id')
  @RequirePermissions('orders.view')
  async card(@Param('id') id: string) {
    return this.orders.getAdminCard(id);
  }

  @Patch(':id/cancel')
  @RequirePermissions('orders.cancel')
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.cancel(id, dto, user.id);
  }

  @Patch(':id/refund')
  @RequirePermissions('orders.refund')
  async refund(
    @Param('id') id: string,
    @Body() dto: RefundOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.refund(id, dto, user.id);
  }
}
