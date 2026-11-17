import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PunishmentsPublicEnabledGuard } from './punishments-http';
import { PunishmentsIssuerHideService } from './punishments-issuer-hide.service';
import { PunishmentsReadService } from './punishments-read.service';
import { PunishmentsSettingsService } from './punishments-settings.service';
import {
  MinecraftPunishmentsAdminController,
  MinecraftPunishmentsMeController,
  MinecraftPunishmentsPublicController,
} from './punishments.controllers';
import { PrismaPunishmentMirrorStore } from './prisma-punishment-mirror.store';
import { PUNISHMENT_MIRROR_STORE } from './punishment-mirror.store';
import { PunishmentsSyncService } from './punishments-sync.service';
import { readPunishmentsConfig } from './punishments.config';
import { PunishmentsScheduler } from './punishments.scheduler';
import {
  PUNISHMENT_SOURCE,
  PUNISHMENTS_CONFIG,
  PUNISHMENTS_RUNTIME,
  SYSTEM_RUNTIME,
} from './punishments.tokens';

/// Модуль зеркала наказаний (этап 02, срез 1). Адаптер источника (LiteBans,
/// mysql2) добавляется в срезе 2 и подставляется под `PUNISHMENT_SOURCE`;
/// пока источник `null`, модуль не имеет побочных эффектов: планировщик не
/// стартует, соединений нет, статус «не настроено».
@Module({
  controllers: [
    MinecraftPunishmentsPublicController,
    MinecraftPunishmentsMeController,
    MinecraftPunishmentsAdminController,
  ],
  providers: [
    {
      provide: PUNISHMENTS_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => readPunishmentsConfig(config),
    },
    { provide: PUNISHMENTS_RUNTIME, useValue: SYSTEM_RUNTIME },
    { provide: PUNISHMENT_SOURCE, useValue: null },
    { provide: PUNISHMENT_MIRROR_STORE, useClass: PrismaPunishmentMirrorStore },
    PunishmentsSyncService,
    PunishmentsScheduler,
    PunishmentsSettingsService,
    PunishmentsReadService,
    PunishmentsIssuerHideService,
    PunishmentsPublicEnabledGuard,
  ],
  exports: [PunishmentsSyncService, PunishmentsReadService],
})
export class PunishmentsModule {}
