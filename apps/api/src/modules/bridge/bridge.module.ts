import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BridgeController } from './bridge.controller';
import { BRIDGE_CONFIG, readBridgeConfig } from './bridge.config';
import { BridgeLogRetentionScheduler } from './bridge-log-retention.scheduler';
import { BridgeIngestService } from './bridge-ingest.service';
import { BridgePunishmentSource } from './bridge-punishment.source';
import { BridgeRateLimitGuard } from './bridge-rate-limit.guard';
import { BridgeRedisService } from './bridge-redis.service';
import { BridgeSignatureGuard } from './bridge-signature.guard';

/// Приёмник Bridge (этап 03, срез 1; ADR-0182). Без `BRIDGE_ENABLED=true` и
/// корректного `BRIDGE_MASTER_SECRET` все пути отвечают 503. События
/// `punishment.*` уходят в `BridgePunishmentSource`; зеркало пишет только
/// подписчик этого источника (синхронизатор этапа 02).
@Module({
  controllers: [BridgeController],
  providers: [
    {
      provide: BRIDGE_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => readBridgeConfig(config),
    },
    BridgeRedisService,
    BridgePunishmentSource,
    BridgeIngestService,
    BridgeSignatureGuard,
    BridgeRateLimitGuard,
    BridgeLogRetentionScheduler,
  ],
  exports: [BridgePunishmentSource],
})
export class BridgeModule {}
