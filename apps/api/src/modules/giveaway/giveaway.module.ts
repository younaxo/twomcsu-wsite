import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GIVEAWAY_CONFIG, readGiveawayConfig } from './giveaway.config';
import { GiveawayController } from './giveaway.controller';
import { GiveawayCodesService } from './giveaway-codes.service';
import { GiveawayPublicController } from './giveaway-public.controller';
import { GiveawayTicketsService } from './giveaway-tickets.service';
import { GiveawayIngestService } from './giveaway-ingest.service';
import { GiveawayRedisService } from './giveaway-redis.service';
import { GiveawaySettingsService } from './giveaway-settings.service';
import { GiveawaySignatureGuard } from './giveaway-signature.guard';

/// Розыгрыш «Анархия Новой Эры», фаза 1: приём событий сессий и подсчёт
/// времени. Выключен по умолчанию (`GIVEAWAY_ENABLED`). См. giveaway/README.md.
@Module({
  controllers: [GiveawayController, GiveawayPublicController],
  providers: [
    {
      provide: GIVEAWAY_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => readGiveawayConfig(config),
    },
    GiveawayRedisService,
    GiveawaySettingsService,
    GiveawayIngestService,
    GiveawayCodesService,
    GiveawayTicketsService,
    GiveawaySignatureGuard,
  ],
  exports: [GiveawaySettingsService, GiveawayIngestService],
})
export class GiveawayModule {}
