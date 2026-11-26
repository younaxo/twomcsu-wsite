import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BridgeDeliveryJobStatus, DeliveryTaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  BridgeDeliveryRetentionConfig,
  readBridgeDeliveryRetention,
} from './bridge-delivery-retention';
import {
  DELIVERY_JOB_CLEANUP_BATCH_SIZE,
  DELIVERY_JOB_CLEANUP_MAX_BATCHES,
} from './bridge.constants';

const CLEANUP_HOUR = 4;
const CLEANUP_MINUTE = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/// Закрытые состояния задания Bridge. QUEUED и CLAIMED не удаляются никогда.
const CLOSED: BridgeDeliveryJobStatus[] = [
  BridgeDeliveryJobStatus.DONE,
  BridgeDeliveryJobStatus.FAILED,
  BridgeDeliveryJobStatus.CANCELLED,
  BridgeDeliveryJobStatus.UNKNOWN,
];

/// Очистка `bridge_delivery_jobs` раз в сутки в 04:30 (L2, ADR-0194), по
/// образцу `BridgeLogRetentionScheduler`: удаляет закрытые строки старше срока
/// пачками. UNKNOWN, чьё задание выдачи всё ещё в NEEDS_ATTENTION (ждёт ручной
/// проверки админом), не удаляется. Удаление строки не трогает задание выдачи
/// (FK идёт от очереди к заданию). Миграции не требует. В логах только числа.
@Injectable()
export class BridgeDeliveryRetentionScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(BridgeDeliveryRetentionScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly cfg: BridgeDeliveryRetentionConfig;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.cfg = readBridgeDeliveryRetention(config);
  }

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || !this.cfg.enabled) return;
    this.schedule();
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  async runOnce(now: Date = new Date()): Promise<{ deleted: number }> {
    const cutoff = new Date(now.getTime() - this.cfg.retentionDays * DAY_MS);
    let deleted = 0;
    for (let i = 0; i < DELIVERY_JOB_CLEANUP_MAX_BATCHES; i++) {
      const rows = await this.prisma.bridgeDeliveryJob.findMany({
        where: {
          status: { in: CLOSED },
          updatedAt: { lt: cutoff },
          NOT: {
            status: BridgeDeliveryJobStatus.UNKNOWN,
            task: { status: DeliveryTaskStatus.NEEDS_ATTENTION },
          },
        },
        orderBy: { updatedAt: 'asc' },
        take: DELIVERY_JOB_CLEANUP_BATCH_SIZE,
        select: { id: true },
      });
      if (rows.length === 0) break;
      // Повторная проверка статуса в DELETE: строку могли вернуть в QUEUED.
      const res = await this.prisma.bridgeDeliveryJob.deleteMany({
        where: {
          id: { in: rows.map((r) => r.id) },
          status: { in: CLOSED },
          updatedAt: { lt: cutoff },
        },
      });
      deleted += res.count;
      if (rows.length < DELIVERY_JOB_CLEANUP_BATCH_SIZE) break;
    }
    this.logger.log(`Задания выдачи Bridge: удалено закрытых ${deleted}`);
    return { deleted };
  }

  private schedule() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(CLEANUP_HOUR, CLEANUP_MINUTE, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    this.timer = setTimeout(() => {
      this.runOnce()
        .catch((error: Error) =>
          this.logger.warn(
            `Очистка заданий выдачи Bridge не удалась: ${error.message}`,
          ),
        )
        .finally(() => this.schedule());
    }, next.getTime() - now.getTime());
    this.timer.unref();
  }
}
