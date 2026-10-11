import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { NewsAdminService } from './news-admin.service';

const INTERVAL_MS = 60_000;

/// Автопубликация запланированных новостей (ADR-0146): раз в минуту в процессе
/// API, по образцу AnnouncementsScheduler (ADR-0081). Повтор в нескольких
/// инстансах безопасен — публикация атомарна (updateMany по статусу). В тестах
/// выключен: e2e вызывают `NewsAdminService.publishDue()` напрямую.
@Injectable()
export class NewsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NewsScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly news: NewsAdminService) {}

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
      const published = await this.news.publishDue();
      if (published > 0) {
        this.logger.log(`Опубликовано запланированных новостей: ${published}`);
      }
    } catch (error) {
      this.logger.warn(
        `Автопубликация новостей не выполнена: ${(error as Error).message}`,
      );
    } finally {
      this.running = false;
    }
  }
}
