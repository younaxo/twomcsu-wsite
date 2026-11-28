import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { LeaderLock } from '../punishments/punishments-leader-lock';
import { RedisService } from '../redis/redis.service';
import { MAILING_TICK_MS, MailingsService } from './mailings.service';

export const MAILING_LEADER_LOCK_KEY = 'communications:mailings:leader';
export const MAILING_LEADER_LOCK_TTL_MS = 10_000;

/// Воркер фоновых рассылок (J-08-4): раз в `MAILING_TICK_MS` у лидера
/// (Redis-блокировка с токеном, как у наказаний) обрабатывает бюджет
/// получателей тика. Нелидер ничего не делает; тики не перекрываются. В тестах
/// выключен: e2e вызывают `MailingsService.processDue()` напрямую.
@Injectable()
export class MailingsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailingsScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private running = false;
  private lock: LeaderLock | null = null;

  constructor(
    private readonly mailings: MailingsService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.lock = new LeaderLock(
      this.redis.client,
      MAILING_LEADER_LOCK_KEY,
      MAILING_LEADER_LOCK_TTL_MS,
    );
    this.schedule();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.lock?.release();
  }

  /// Подмена блокировки в unit-тестах.
  useLock(lock: LeaderLock | null): void {
    this.lock = lock;
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), MAILING_TICK_MS);
    this.timer.unref();
  }

  /// Один цикл; публичен для тестов. Возвращает обработанных получателей.
  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const lock = this.lock;
      if (!lock || !(await lock.acquireOrRenew())) return 0;
      return await this.mailings.processDue(
        this.mailings.ratePerSec * (MAILING_TICK_MS / 1000),
        () => lock.acquireOrRenew(),
      );
    } catch (error) {
      this.logger.warn(
        `Фоновая рассылка не выполнена: ${(error as Error).message}`,
      );
      return 0;
    } finally {
      this.running = false;
      this.schedule();
    }
  }
}
