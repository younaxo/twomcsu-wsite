import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { STORE_RECONCILE_INTERVAL_MS } from './refunds-config';
import { StoreReconcileService } from './store-reconcile.service';

/// Таймер сверки платежей и возвратов (0.9, ADR-0188) по образцу
/// `DeliveryReconcileScheduler`. Работа внутри `runOnce` только при
/// STORE_REFUNDS_ENABLED=true; в тестах таймер выключен.
@Injectable()
export class StoreReconcileScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StoreReconcileScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(private readonly reconcile: StoreReconcileService) {}

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
      STORE_RECONCILE_INTERVAL_MS,
    );
    this.timer.unref();
  }

  private async tick(): Promise<void> {
    try {
      const report = await this.reconcile.runOnce();
      if (report.checked > 0 || report.refundsResolved > 0) {
        this.logger.log(
          `Сверка: проверено=${report.checked} оплачено=${report.completed} отказов=${report.failed} ожидают=${report.stillPending} возвратов=${report.refundsResolved} ошибок=${report.errors}`,
        );
      }
    } catch {
      this.logger.warn('Сбой сверки платежей');
    } finally {
      this.schedule();
    }
  }
}
