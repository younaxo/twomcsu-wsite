import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BridgeController } from './bridge.controller';
import { BRIDGE_CONFIG, readBridgeConfig } from './bridge.config';
import { InventoryModule } from '../inventory/inventory.module';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { PunishmentsModule } from '../punishments/punishments.module';
import { BridgeMirrorSubscriber } from './bridge-mirror.subscriber';
import { BridgeLogRetentionScheduler } from './bridge-log-retention.scheduler';
import { BridgeDeliveryRetentionScheduler } from './bridge-delivery-retention.scheduler';
import { BridgeDeliveryService } from './bridge-delivery.service';
import { BridgeIngestService } from './bridge-ingest.service';
import { BridgePunishmentSource } from './bridge-punishment.source';
import { BridgeRateLimitGuard } from './bridge-rate-limit.guard';
import { BridgeRedisService } from './bridge-redis.service';
import { BridgeInventoryService } from './bridge-inventory.service';
import { BridgeStatsService } from './bridge-stats.service';
import { BridgeSignatureGuard } from './bridge-signature.guard';

/// Приёмник Bridge (этап 03, срез 1; ADR-0182). Без `BRIDGE_ENABLED=true` и
/// корректного `BRIDGE_MASTER_SECRET` все пути отвечают 503. События
/// `punishment.*` уходят в `BridgePunishmentSource`; зеркало пишет только
/// подписчик этого источника (синхронизатор этапа 02).
@Module({
  imports: [PunishmentsModule, LeaderboardsModule, InventoryModule],
  controllers: [BridgeController],
  providers: [
    {
      provide: BRIDGE_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => readBridgeConfig(config),
    },
    BridgeRedisService,
    BridgePunishmentSource,
    BridgeMirrorSubscriber,
    BridgeIngestService,
    BridgeStatsService,
    BridgeInventoryService,
    BridgeDeliveryService,
    BridgeSignatureGuard,
    BridgeRateLimitGuard,
    BridgeLogRetentionScheduler,
    BridgeDeliveryRetentionScheduler,
  ],
  exports: [BridgePunishmentSource, BridgeDeliveryService],
})
export class BridgeModule {}
