import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { DELIVERY_RECONCILE_INTERVAL_MS } from './delivery.constants';
import { sanitizeDeliveryError } from './delivery-status';

/// Фоновая сверка заданий выдачи (ADR-0184, «Реализация 0.7»): по образцу
/// `DeliveryWorkerScheduler` (таймер процесса, ScheduleModule в проекте нет).
/// Выключается env `DELIVERY_RECONCILE_ENABLED=false` (проверяет сам сервис на
/// каждом проходе). Параллельные инстансы не конфликтуют: каждый заказ
/// обрабатывается под `pg_try_advisory_xact_lock`, вставка идемпотентна
/// (UNIQUE orderItemId+step). Цикл не перекрывается сам с собой; в тестах
/// таймер выключен.
@Injectable()
export class DeliveryReconcileScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DeliveryReconcileScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(private readonly delivery: DeliveryService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.schedule();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = setTimeout(
      () => void this.tick(),
      DELIVERY_RECONCILE_INTERVAL_MS,
    );
    this.timer.unref();
  }

  private async tick(): Promise<void> {
    try {
      await this.delivery.reconcileMissingTasks();
    } catch (error) {
      this.logger.warn(
        `Сбой сверки заданий выдачи: ${sanitizeDeliveryError(error)}`,
      );
    } finally {
      this.schedule();
    }
  }
}
