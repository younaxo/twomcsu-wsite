import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
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

  @Patch(':id/cancel')
  @RequirePermissions('orders.cancel')
  async cancel(@Param('id') id: string, @Body() dto: CancelOrderDto) {
    return this.orders.cancel(id, dto);
  }

  @Patch(':id/refund')
  @RequirePermissions('orders.refund')
  async refund(@Param('id') id: string, @Body() dto: RefundOrderDto) {
    return this.orders.refund(id, dto);
  }
}
