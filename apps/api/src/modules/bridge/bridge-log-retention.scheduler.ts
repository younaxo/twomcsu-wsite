import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  BridgeLogRetentionConfig,
  readBridgeLogRetention,
} from './bridge-log-retention';
import {
  LOG_AGE_ALERT_DAYS,
  LOG_CLEANUP_BATCH_SIZE,
  LOG_CLEANUP_MAX_BATCHES,
} from './bridge.constants';

const CLEANUP_HOUR = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface BridgeLogCleanupResult {
  deleted: number;
  oldestAgeDays: number | null;
}

/// Очистка `bridge_event_log` раз в сутки в 04:00 (F5, ADR-0182): таймер
/// процесса по образцу `StorageRetentionScheduler`, удаление пачками по
/// `receivedAt`. Порог не меньше 7 суток; в тестах таймер выключен. В логах
/// только числа: без `eventId`, `payloadHash` и данных событий.
@Injectable()
export class BridgeLogRetentionScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(BridgeLogRetentionScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly cfg: BridgeLogRetentionConfig;
  /// Метрика: возраст самой старой строки (сутки) после последней очистки.
  lastOldestAgeDays: number | null = null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.cfg = readBridgeLogRetention(config);
  }

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || !this.cfg.enabled) return;
    this.schedule();
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  async runOnce(now: Date = new Date()): Promise<BridgeLogCleanupResult> {
    const cutoff = new Date(now.getTime() - this.cfg.retentionDays * DAY_MS);
    let deleted = 0;
    for (let i = 0; i < LOG_CLEANUP_MAX_BATCHES; i++) {
      const rows = await this.prisma.bridgeEventLog.findMany({
        where: { receivedAt: { lt: cutoff } },
        orderBy: { receivedAt: 'asc' },
        take: LOG_CLEANUP_BATCH_SIZE,
        select: { id: true },
      });
      if (rows.length === 0) break;
      const res = await this.prisma.bridgeEventLog.deleteMany({
        where: { id: { in: rows.map((r) => r.id) } },
      });
      deleted += res.count;
      if (rows.length < LOG_CLEANUP_BATCH_SIZE) break;
    }
    const oldest = await this.prisma.bridgeEventLog.findFirst({
      orderBy: { receivedAt: 'asc' },
      select: { receivedAt: true },
    });
    const oldestAgeDays = oldest
      ? (now.getTime() - oldest.receivedAt.getTime()) / DAY_MS
      : null;
    this.lastOldestAgeDays = oldestAgeDays;
    const age = oldestAgeDays === null ? 'нет' : oldestAgeDays.toFixed(2);
    if (oldestAgeDays !== null && oldestAgeDays > LOG_AGE_ALERT_DAYS) {
      this.logger.warn(
        `Журнал Bridge: старейшая строка ${age} сут. (> ${LOG_AGE_ALERT_DAYS}), очистка отстаёт; удалено ${deleted}`,
      );
    } else {
      this.logger.log(
        `Журнал Bridge: удалено ${deleted}, старейшая строка (сут.): ${age}`,
      );
    }
    return { deleted, oldestAgeDays };
  }

  private schedule() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(CLEANUP_HOUR, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    this.timer = setTimeout(() => {
      this.runOnce()
        .catch((error: Error) =>
          this.logger.warn(
            `Очистка журнала Bridge не удалась: ${error.message}`,
          ),
        )
        .finally(() => this.schedule());
    }, next.getTime() - now.getTime());
    this.timer.unref();
  }
}
