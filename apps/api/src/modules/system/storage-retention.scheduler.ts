import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { StorageRetentionService } from './storage-retention.service';

const CLEANUP_HOUR = 4;

/// Автоочистка служебных журналов раз в сутки в 04:00 (ADR-0084) — таймер
/// процесса, без внешнего планировщика; в тестах выключен. Заменяет прежний
/// таймер очистки аудита в AuditService.
@Injectable()
export class StorageRetentionScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(StorageRetentionScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly retention: StorageRetentionService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.schedule();
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(CLEANUP_HOUR, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    this.timer = setTimeout(() => {
      this.retention
        .runAuto()
        .catch((error: Error) =>
          this.logger.warn(`Автоочистка журналов не удалась: ${error.message}`),
        )
        .finally(() => this.schedule());
    }, next.getTime() - now.getTime());
    this.timer.unref();
  }
}
