import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Request, Response } from 'express';
import { STREAM_HEARTBEAT_MS, STREAM_MAX_PER_IP } from './giveaway.constants';
import { GiveawayRedisService } from './giveaway-redis.service';

export type StreamChannel = 'live' | 'test';
export type StreamEvent = 'results' | 'reset';

interface Client {
  res: Response;
  channel: StreamChannel;
  ipKey: string;
  /// Перепроверка прав долгоживущего соединения (тестовый канал: админ-сессия).
  revalidate: (() => Promise<boolean>) | null;
}

interface Message {
  channel: StreamChannel;
  event: StreamEvent;
  data: Record<string, unknown>;
}

/// SSE-эфир (ADR-G003 п. 8): рассылка через Redis pub/sub (несколько
/// инстансов), heartbeat-комментарии, лимит соединений на адрес (в памяти
/// инстанса). В логи не попадают адреса и содержимое событий.
@Injectable()
export class GiveawayStreamService implements OnModuleDestroy {
  private readonly logger = new Logger(GiveawayStreamService.name);
  private readonly clients = new Set<Client>();
  private readonly perIp = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private subscribed = false;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly redis: GiveawayRedisService) {}

  onModuleDestroy(): void {
    this.stopTimer();
    this.unsubscribe?.();
    for (const c of this.clients) c.res.end();
    this.clients.clear();
    this.perIp.clear();
  }

  /// Число подключённых клиентов (для тестов и диагностики).
  clientCount(): number {
    return this.clients.size;
  }

  /// false - достигнут лимит соединений на адрес.
  async attach(
    req: Request,
    res: Response,
    channel: StreamChannel,
    ipKey: string,
    revision: number,
    revalidate: (() => Promise<boolean>) | null = null,
  ): Promise<boolean> {
    const used = this.perIp.get(ipKey) ?? 0;
    if (used >= STREAM_MAX_PER_IP) return false;
    this.perIp.set(ipKey, used + 1);
    const client: Client = { res, channel, ipKey, revalidate };
    this.clients.add(client);
    let closed = false;
    const cleanup = (): void => {
      if (closed) return;
      closed = true;
      this.clients.delete(client);
      const left = (this.perIp.get(ipKey) ?? 1) - 1;
      if (left <= 0) this.perIp.delete(ipKey);
      else this.perIp.set(ipKey, left);
      if (this.clients.size === 0) this.stopTimer();
    };
    req.on('close', cleanup);
    res.on('close', cleanup);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write('retry: 5000\n\n');
    this.write(client, 'ready', { revision });
    this.startTimer();
    await this.ensureSubscribed();
    return true;
  }

  private async ensureSubscribed(): Promise<void> {
    if (this.subscribed) return;
    this.subscribed = true;
    try {
      this.unsubscribe = await this.redis.subscribe((m) => this.onMessage(m));
    } catch {
      this.subscribed = false;
    }
  }

  private onMessage(raw: string): void {
    let m: Message;
    try {
      m = JSON.parse(raw) as Message;
    } catch {
      return;
    }
    if (
      (m.channel !== 'live' && m.channel !== 'test') ||
      (m.event !== 'results' && m.event !== 'reset')
    ) {
      return;
    }
    this.deliver(m);
  }

  private deliver(m: Message): void {
    for (const c of this.clients) {
      if (c.channel !== m.channel) continue;
      if (c.revalidate === null) this.write(c, m.event, m.data);
      else void this.deliverChecked(c, m);
    }
  }

  /// Соединение с перепроверкой: перед событием сессия должна быть жива, иначе
  /// клиенту отправляется `unauthorized` и соединение закрывается.
  private async deliverChecked(c: Client, m: Message): Promise<void> {
    if (await this.stillAllowed(c)) this.write(c, m.event, m.data);
  }

  private async stillAllowed(c: Client): Promise<boolean> {
    if (c.revalidate === null) return true;
    let ok = false;
    try {
      ok = await c.revalidate();
    } catch {
      ok = false;
    }
    if (!ok) {
      this.write(c, 'unauthorized', {});
      try {
        c.res.end();
      } catch {
        /* см. close */
      }
    }
    return ok;
  }

  /// Публикация: через Redis (рассылка всем инстансам); если подписчика нет
  /// или Redis недоступен - локальная рассылка (ADR-G003 п. 8.3).
  async publish(
    channel: StreamChannel,
    event: StreamEvent,
    data: Record<string, unknown>,
  ): Promise<void> {
    const message: Message = { channel, event, data };
    let viaRedis = false;
    try {
      await this.redis.publish(JSON.stringify(message));
      viaRedis = this.redis.hasSubscriber();
    } catch {
      this.logger.warn('giveaway stream publish via redis failed');
    }
    if (!viaRedis) this.deliver(message);
  }

  private write(c: Client, event: string, data: unknown): void {
    try {
      c.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      /* соединение закроется обработчиком close */
    }
  }

  private startTimer(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      for (const c of this.clients) {
        try {
          c.res.write(': hb\n\n');
        } catch {
          /* см. close */
        }
        if (c.revalidate !== null) void this.stillAllowed(c);
      }
    }, STREAM_HEARTBEAT_MS);
    this.timer.unref();
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
