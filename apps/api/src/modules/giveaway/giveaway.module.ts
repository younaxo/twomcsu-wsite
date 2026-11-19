import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GIVEAWAY_CONFIG,
  GiveawayConfig,
  readGiveawayConfig,
} from './giveaway.config';
import { GiveawayController } from './giveaway.controller';
import { GiveawayCodesService } from './giveaway-codes.service';
import { GiveawayPublicController } from './giveaway-public.controller';
import { GiveawayTicketsService } from './giveaway-tickets.service';
import { GiveawayIngestService } from './giveaway-ingest.service';
import { GiveawayRedisService } from './giveaway-redis.service';
import { GiveawaySettingsService } from './giveaway-settings.service';
import { GiveawaySignatureGuard } from './giveaway-signature.guard';
import { GiveawayAdminAuditService } from './giveaway-admin-audit.service';
import { GiveawayAdminAuthController } from './giveaway-admin-auth.controller';
import { GiveawayAdminAuthService } from './giveaway-admin-auth.service';
import { GiveawayAdminController } from './giveaway-admin.controller';
import { GiveawayAdminGuard } from './giveaway-admin.guard';
import { GiveawayAdminSettingsService } from './giveaway-admin-settings.service';
import { GiveawayDataService } from './giveaway-data.service';
import { GiveawayDiscordClient } from './giveaway-discord.client';
import { GiveawayDrawService } from './giveaway-draw.service';
import { GiveawayPrizesService } from './giveaway-prizes.service';
import {
  GIVEAWAY_PRIZES_CONFIG,
  loadPrizesConfig,
} from './giveaway-prizes-config';
import { GiveawayStreamController } from './giveaway-stream.controller';
import { GiveawayStreamService } from './giveaway-stream.service';
import { GiveawayTestService } from './giveaway-test.service';

/// Розыгрыш «Анархия Новой Эры»: приём событий и подсчёт времени (фаза 1),
/// коды и билеты (фаза 2), админка, итоги, эфир и тестовый режим (фаза 3). Выключен по умолчанию (`GIVEAWAY_ENABLED`). См. giveaway/README.md.
@Module({
  controllers: [
    GiveawayController,
    GiveawayPublicController,
    GiveawayAdminAuthController,
    GiveawayAdminController,
    GiveawayStreamController,
  ],
  providers: [
    {
      provide: GIVEAWAY_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => readGiveawayConfig(config),
    },
    {
      // Призы из giveaway/config/prizes.json: проверка при старте, ошибка
      // останавливает приложение (fail closed). Выключенный розыгрыш не читает.
      provide: GIVEAWAY_PRIZES_CONFIG,
      inject: [GIVEAWAY_CONFIG],
      useFactory: (config: GiveawayConfig) =>
        config.enabled ? loadPrizesConfig(config.admin.prizesConfigPath) : [],
    },
    GiveawayRedisService,
    GiveawaySettingsService,
    GiveawayIngestService,
    GiveawayCodesService,
    GiveawayTicketsService,
    GiveawaySignatureGuard,
    GiveawayDiscordClient,
    GiveawayAdminAuditService,
    GiveawayAdminAuthService,
    GiveawayAdminGuard,
    GiveawayAdminSettingsService,
    GiveawayDataService,
    GiveawayPrizesService,
    GiveawayStreamService,
    GiveawayTestService,
    GiveawayDrawService,
  ],
  exports: [GiveawaySettingsService, GiveawayIngestService],
})
export class GiveawayModule {}
