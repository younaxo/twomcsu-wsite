import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { SiteModuleGuard } from './site-module.guard';
import { SiteStatusService } from './site-status.service';
import { StorageAdminController } from './storage.controller';
import { StorageRetentionScheduler } from './storage-retention.scheduler';
import { StorageRetentionService } from './storage-retention.service';
import { PrismaSiteStatusStore, SiteStatusStore } from './site-status.store';
import {
  SiteStatusController,
  SystemAdminController,
} from './system.controller';
import { SystemService } from './system.service';

/// Модули сайта и технические работы (ADR-0082), хранилище и журналы
/// (ADR-0084). Глобальный: состояние
/// нужно guard'у и `/site/settings` (флаги модулей для shell).
@Global()
@Module({
  imports: [AuthModule],
  controllers: [
    SystemAdminController,
    SiteStatusController,
    StorageAdminController,
  ],
  providers: [
    { provide: SiteStatusStore, useClass: PrismaSiteStatusStore },
    SiteStatusService,
    SystemService,
    StorageRetentionService,
    StorageRetentionScheduler,
    { provide: APP_GUARD, useClass: SiteModuleGuard },
  ],
  exports: [SiteStatusService],
})
export class SystemModule {}
