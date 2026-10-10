import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';

const INTERVAL_MS = 60_000;

/// Фоновая рассылка уведомлений по запланированным объявлениям (ADR-0081):
/// раз в минуту в процессе API. Повтор в нескольких инстансах безопасен —
/// каждое объявление захватывается атомарно (`notifiedAt`). В тестах
/// выключен: e2e вызывают `AnnouncementsService.dispatchDue()` напрямую.
@Injectable()
export class AnnouncementsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnnouncementsScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly announcements: AnnouncementsService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.announcements.dispatchDue();
    } catch (error) {
      this.logger.warn(
        `Рассылка объявлений не выполнена: ${(error as Error).message}`,
      );
    } finally {
      this.running = false;
    }
  }
}
