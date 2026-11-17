import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { LeaderLock } from './punishments-leader-lock';
import { PunishmentsSyncService } from './punishments-sync.service';
import { PunishmentsConfig } from './punishments.config';
import { PUNISHMENTS_CONFIG } from './punishments.tokens';

/// Планировщик опроса. Без источника или при `LITEBANS_ENABLED=false` не
/// запускает ничего: ни таймеров, ни обращений к Redis. Опрос идёт только у
/// лидера (Redis-блокировка с токеном), цикл не перекрывается сам с собой.
@Injectable()
export class PunishmentsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PunishmentsScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private lock: LeaderLock | null = null;

  constructor(
    private readonly sync: PunishmentsSyncService,
    private readonly redis: RedisService,
    @Inject(PUNISHMENTS_CONFIG) private readonly config: PunishmentsConfig,
  ) {}

  onModuleInit(): void {
    if (!this.sync.isConfigured) {
      this.logger.log(
        'Синхронизация наказаний не настроена: планировщик не запущен',
      );
      return;
    }
    this.lock = new LeaderLock(this.redis.client);
    this.schedule();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.lock?.release();
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), this.config.pollIntervalMs);
    this.timer.unref();
  }

  private async tick(): Promise<void> {
    try {
      const lock = this.lock;
      if (lock && (await lock.acquireOrRenew())) {
        await this.sync.runOnce(() => lock.acquireOrRenew());
      }
    } catch (error) {
      this.logger.warn(`Сбой цикла опроса наказаний: ${(error as Error).name}`);
    } finally {
      this.schedule();
    }
  }
}
