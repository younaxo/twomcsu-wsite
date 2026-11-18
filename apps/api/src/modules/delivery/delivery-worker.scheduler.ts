import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { DELIVERY_POLL_INTERVAL_MS } from './delivery.constants';
import { sanitizeDeliveryError } from './delivery-status';

/// Цикл воркера выдачи: таймер процесса по образцу существующих планировщиков
/// (ScheduleModule в проекте нет). Лидерство не нужно: захват строки
/// `FOR UPDATE SKIP LOCKED` достаточен (ADR-0184 п. 5). Флаг доставки
/// проверяет сам `processBatch` на каждом проходе (настройка БД с кэшем до 30 с
/// и жёсткий запрет env), поэтому включение действует без перезапуска. Цикл не
/// перекрывается сам с собой; в тестах таймер выключен.
@Injectable()
export class DeliveryWorkerScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeliveryWorkerScheduler.name);
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
    this.timer = setTimeout(() => void this.tick(), DELIVERY_POLL_INTERVAL_MS);
    this.timer.unref();
  }

  private async tick(): Promise<void> {
    try {
      await this.delivery.processBatch();
    } catch (error) {
      this.logger.warn(`Сбой цикла выдачи: ${sanitizeDeliveryError(error)}`);
    } finally {
      this.schedule();
    }
  }
}
