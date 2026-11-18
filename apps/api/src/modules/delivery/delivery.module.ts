import { Module } from '@nestjs/common';
import { DeliveryAdminController } from './delivery-admin.controller';
import { DeliveryWorkerScheduler } from './delivery-worker.scheduler';
import { DeliveryService } from './delivery.service';
import { CommandExecutor } from './executors/command.executor';
import { ManualExecutor } from './executors/manual.executor';
import { SiteExecutor } from './executors/site.executor';

/// Слой доставки купленного (0.7, ADR-0184). Транспорт команд
/// (`COMMAND_TRANSPORT`) здесь НЕ предоставляется: реальных транспортов в 0.7
/// нет, `CommandExecutor` без него возвращает `retry`.
@Module({
  controllers: [DeliveryAdminController],
  providers: [
    DeliveryService,
    DeliveryWorkerScheduler,
    ManualExecutor,
    SiteExecutor,
    CommandExecutor,
  ],
  exports: [DeliveryService],
})
export class DeliveryModule {}
