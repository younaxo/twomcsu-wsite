import { Module } from '@nestjs/common';
import { BridgeModule } from '../bridge/bridge.module';
import { WalletModule } from '../wallet/wallet.module';
import { BridgeAckApplier } from './bridge-ack-applier';
import { DeliveryAdminController } from './delivery-admin.controller';
import { DeliveryReconcileScheduler } from './delivery-reconcile.scheduler';
import { DeliveryWorkerScheduler } from './delivery-worker.scheduler';
import { DeliveryService } from './delivery.service';
import { BridgeExecutor } from './executors/bridge.executor';
import { CommandExecutor } from './executors/command.executor';
import { ManualExecutor } from './executors/manual.executor';
import { SiteExecutor } from './executors/site.executor';
import { WalletExecutor } from './executors/wallet.executor';

/// Слой доставки купленного (0.7, ADR-0184). Транспорт команд
/// (`COMMAND_TRANSPORT`) здесь НЕ предоставляется: реальных транспортов в 0.7
/// нет, `CommandExecutor` без него возвращает `retry`.
@Module({
  imports: [WalletModule, BridgeModule],
  controllers: [DeliveryAdminController],
  providers: [
    DeliveryService,
    DeliveryWorkerScheduler,
    DeliveryReconcileScheduler,
    ManualExecutor,
    SiteExecutor,
    CommandExecutor,
    WalletExecutor,
    BridgeExecutor,
    BridgeAckApplier,
  ],
  exports: [DeliveryService],
})
export class DeliveryModule {}
