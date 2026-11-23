import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { UpdateStoreSettingsDto } from './dto/store-settings.dto';
import { StoreSettingsService } from './store-settings.service';

/// Публичные тексты магазина (правила снятия, политика возвратов, перки).
@Controller('store/texts')
export class StoreTextsController {
  constructor(private readonly settings: StoreSettingsService) {}

  @Get()
  async texts() {
    return this.settings.getTexts();
  }
}

/// Редактирование текстов магазина без деплоя (право `store.settings.manage`).
@Controller('admin/store/settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StoreSettingsAdminController {
  constructor(private readonly settings: StoreSettingsService) {}

  @Get()
  @RequirePermissions('store.settings.manage')
  async get() {
    return this.settings.getTexts();
  }

  @Put()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @RequirePermissions('store.settings.manage')
  async update(
    @Body() dto: UpdateStoreSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.settings.update(dto.values, user.id);
  }
}
