import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type Redis from 'ioredis';
import { RedisService } from '../redis/redis.service';
import { INCR_EXPIRE_SCRIPT } from '../bridge/bridge-redis.service';
import { sha256Hex } from './giveaway-crypto';
import {
  EVENTS_PER_MINUTE,
  REQUESTS_PER_MINUTE,
  STREAM_CHANNEL,
} from './giveaway.constants';

const TAKE_SCRIPT =
  'local v = redis.call("GET", KEYS[1]) if v then redis.call("DEL", KEYS[1]) end return v';

/// Обращения приёмника к Redis. Ошибки не глотаются: вызывающий отвечает 503
/// (fail-closed). В ключах нет секретов и IP игроков.
@Injectable()
export class GiveawayRedisService implements OnModuleDestroy {
  private readonly logger = new Logger(GiveawayRedisService.name);
  private sub: Redis | null = null;
  private subReady: Promise<void> | null = null;
  private readonly listeners = new Set<(message: string) => void>();

  constructor(private readonly redis: RedisService) {}

  onModuleDestroy(): void {
    this.sub?.disconnect();
    this.sub = null;
  }

  /// `SET NX EX`; `false` - нонс уже использован. TTL >= 2 окон времени.
  async claimNonce(
    keyId: string,
    nonce: string,
    ttlS: number,
  ): Promise<boolean> {
    const res = await this.redis.client.set(
      `giveaway:nonce:${keyId}:${nonce}`,
      '1',
      'EX',
      ttlS,
      'NX',
    );
    return res === 'OK';
  }

  private async bucket(
    scope: string,
    serverId: string,
    amount: number,
    limit: number,
  ): Promise<number> {
    const nowS = Math.floor(Date.now() / 1000);
    const bucket = Math.floor(nowS / 60);
    const n = Number(
      await this.redis.client.eval(
        INCR_EXPIRE_SCRIPT,
        1,
        `giveaway:rl:${scope}:${serverId}:${bucket}`,
        String(amount),
        '61',
        'first',
      ),
    );
    if (n <= limit) return 0;
    return Math.max(1, (bucket + 1) * 60 - nowS);
  }

  /// Retry-After в секундах; 0 - можно.
  requestRetryAfter(serverId: string): Promise<number> {
    return this.bucket('req', serverId, 1, REQUESTS_PER_MINUTE);
  }

  eventsRetryAfter(serverId: string, count: number): Promise<number> {
    return this.bucket('ev', serverId, count, EVENTS_PER_MINUTE);
  }

  /// Фиксированное окно windowS; в ключе хэш субъекта (адрес, сессия, UUID),
  /// а не сам субъект. Retry-After в секундах; 0 - можно (ADR-G002).
  async hit(
    scope: string,
    subject: string,
    limit: number,
    windowS: number,
  ): Promise<number> {
    const nowS = Math.floor(Date.now() / 1000);
    const bucket = Math.floor(nowS / windowS);
    const n = Number(
      await this.redis.client.eval(
        INCR_EXPIRE_SCRIPT,
        1,
        `giveaway:rl:${scope}:${sha256Hex(subject).slice(0, 32)}:${bucket}`,
        '1',
        String(windowS + 1),
        'first',
      ),
    );
    if (n <= limit) return 0;
    return Math.max(1, (bucket + 1) * windowS - nowS);
  }

  /// Замок на субъект (SET NX EX); false - уже занят.
  async acquireLock(subject: string, ttlS: number): Promise<boolean> {
    const res = await this.redis.client.set(
      `giveaway:lock:${sha256Hex(subject).slice(0, 32)}`,
      '1',
      'EX',
      ttlS,
      'NX',
    );
    return res === 'OK';
  }

  async releaseLock(subject: string): Promise<void> {
    await this.redis.client.del(
      `giveaway:lock:${sha256Hex(subject).slice(0, 32)}`,
    );
  }

  /// Состояние OAuth (ADR-G003 п. 2.2): ключ - хэш state, TTL в секундах.
  async putOAuthState(
    stateHash: string,
    value: string,
    ttlS: number,
  ): Promise<void> {
    await this.redis.client.set(
      `giveaway:oauth:${stateHash}`,
      value,
      'EX',
      ttlS,
    );
  }

  /// Атомарно читает и удаляет состояние (одноразовость); null - нет.
  async takeOAuthState(stateHash: string): Promise<string | null> {
    const v = await this.redis.client.eval(
      TAKE_SCRIPT,
      1,
      `giveaway:oauth:${stateHash}`,
    );
    return typeof v === 'string' ? v : null;
  }

  /// Публикация события эфира (ADR-G003 п. 8.3).
  async publish(message: string): Promise<void> {
    await this.redis.client.publish(STREAM_CHANNEL, message);
  }

  /// Ленивая подписка этого инстанса; возвращает функцию отписки слушателя.
  async subscribe(listener: (message: string) => void): Promise<() => void> {
    this.listeners.add(listener);
    if (this.subReady === null) {
      this.subReady = this.openSubscriber().catch((err: unknown) => {
        this.subReady = null;
        this.logger.error('giveaway stream subscribe failed');
        throw err;
      });
    }
    try {
      await this.subReady;
    } catch {
      /* публикация деградирует до локальной рассылки */
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async openSubscriber(): Promise<void> {
    const sub = this.redis.client.duplicate();
    sub.on('error', () => undefined);
    sub.on('message', (_channel: string, message: string) => {
      for (const l of this.listeners) l(message);
    });
    await sub.connect();
    await sub.subscribe(STREAM_CHANNEL);
    this.sub = sub;
  }

  /// true, если подписчик Redis активен (иначе вызывающий рассылает локально).
  hasSubscriber(): boolean {
    return this.sub !== null;
  }
}
