import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MinecraftStatusService } from './minecraft-status.service';

/// Период сборщика: история онлайна — не реже раза в 5 минут на сервер.
export const COLLECT_INTERVAL_MS = 5 * 60_000;

/// Сборщик статусов серверов (ADR-0147, срез 8.6): раньше история онлайна
/// (ServerStatusLog) писалась только когда кто-то открывал сайт — ночью и при
/// малом трафике в графике были дыры. Раз в 5 минут опрашивает каждый
/// активный сервер через тот же MinecraftStatusService: свежий снапшот из
/// кэша не пингуется повторно, а строку истории за окно пишет только первый
/// (Redis NX) — повтор в нескольких инстансах API не дублирует историю.
/// В тестах выключен: e2e и unit вызывают `collect()` напрямую.
@Injectable()
export class ServerStatusCollector implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ServerStatusCollector.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly status: MinecraftStatusService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), COLLECT_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /// Опрашивает активные серверы по одному; сбой одного не останавливает
  /// остальных. Возвращает число опрошенных.
  async collect(): Promise<number> {
    const servers = await this.prisma.server.findMany({
      where: { isActive: true },
      select: { id: true, address: true, port: true },
    });
    let collected = 0;
    for (const server of servers) {
      try {
        await this.status.fetchAndLog(server.id, server.address, server.port);
        collected += 1;
      } catch (error) {
        this.logger.warn(
          `Статус сервера ${server.id} не собран: ${(error as Error).message}`,
        );
      }
    }
    return collected;
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.collect();
    } catch (error) {
      this.logger.warn(
        `Сборщик статусов не выполнен: ${(error as Error).message}`,
      );
    } finally {
      this.running = false;
    }
  }
}
