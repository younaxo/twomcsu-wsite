import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import {
  CreateStoreRefundDto,
  ListStoreRefundsQueryDto,
} from './dto/store-refund.dto';
import { RefundsService } from './refunds.service';

/// Админ-API возвратов (0.9, ADR-0188). Всё за флагом STORE_REFUNDS_ENABLED
/// (выкл. -> 503 `refunds_disabled`). Свежая 2FA — код в теле (`twoFactorCode`).
@Controller('admin/store/refunds')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RefundsAdminController {
  constructor(private readonly refunds: RefundsService) {}

  @Get()
  @RequirePermissions('orders.refund')
  async list(@Query() query: ListStoreRefundsQueryDto) {
    return this.refunds.list(query);
  }

  @Post('orders/:orderId')
  @RequirePermissions('orders.refund')
  async create(
    @Param('orderId') orderId: string,
    @Body() dto: CreateStoreRefundDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.refunds.create(orderId, dto, user.id);
  }

  /// «Возврат по ошибке» после выдачи: оба права обязательны.
  @Post('orders/:orderId/override')
  @RequirePermissions('orders.refund', 'store.refund.override')
  async override(
    @Param('orderId') orderId: string,
    @Body() dto: CreateStoreRefundDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.refunds.override(orderId, dto, user.id);
  }
}
