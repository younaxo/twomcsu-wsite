import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { AdjustWalletDto, WalletHistoryQueryDto } from './dto/wallet.dto';
import { WalletAdminService } from './wallet-admin.service';

/// Админ-API кошелька (0.15, ADR-0191). Выкл. флаг -> 503 `wallet_disabled`.
@Controller('admin/wallet')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WalletAdminController {
  constructor(private readonly admin: WalletAdminService) {}

  @Get('users/:userId')
  @RequirePermissions('wallet.view')
  view(@Param('userId') userId: string, @Query() query: WalletHistoryQueryDto) {
    return this.admin.view(userId, query.page ?? 1, query.limit ?? 30);
  }

  @Post('users/:userId/adjust')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermissions('wallet.adjust')
  adjust(
    @Param('userId') userId: string,
    @Body() dto: AdjustWalletDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admin.adjust(userId, dto, user.id);
  }
}
