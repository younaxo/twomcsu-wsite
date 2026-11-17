import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { rateLimitKey } from '../../config/trust-proxy';
import { RedisService } from '../redis/redis.service';
import { StoreCartError } from './store-errors';

/// Лимиты операций корзины с подарком (допущение владельца Q81, ревью Q&S
/// 2026-11-18, M1). На пользователя — строго 10/мин и 60/час. На IP (IPv6 по
/// /64, ADR-0177) — мягче (30/мин, 200/час): общий NAT не должен блокировать
/// честных игроков, но перебор ников с нескольких аккаунтов одного адреса
/// упирается в потолок.
export const CART_GIFT_LIMITS = {
  user: { perMinute: 10, perHour: 60 },
  ip: { perMinute: 30, perHour: 200 },
} as const;

const MINUTE_SEC = 60;
const HOUR_SEC = 3600;

interface GiftRateRequest {
  user?: { id?: string };
  body?: { giftToUsername?: unknown };
  ip?: string;
  socket?: { remoteAddress?: string };
}

/// Действует только на запросы с непустым `giftToUsername`: операции без
/// подарка (и снятие подарка пустой строкой) остаются под глобальным лимитом.
/// Стоит после JwtAuthGuard (уровень метода), поэтому `req.user` уже есть.
/// Окно фиксированное; счётчик растёт и у отклонённых запросов. Redis
/// недоступен — отказ 503 (fail closed): без счётчика перебор не ограничен.
@Injectable()
export class CartGiftRateGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<GiftRateRequest>();
    const username = req.body?.giftToUsername;
    if (typeof username !== 'string' || username.length === 0) {
      return true;
    }
    const userId = req.user?.id;
    const ipKey = rateLimitKey(req.ip ?? req.socket?.remoteAddress);
    const checks: { key: string; limit: number; windowSec: number }[] = [
      ...(userId
        ? [
            {
              key: `cart:gift:u:${userId}:m`,
              limit: CART_GIFT_LIMITS.user.perMinute,
              windowSec: MINUTE_SEC,
            },
            {
              key: `cart:gift:u:${userId}:h`,
              limit: CART_GIFT_LIMITS.user.perHour,
              windowSec: HOUR_SEC,
            },
          ]
        : []),
      {
        key: `cart:gift:ip:${ipKey}:m`,
        limit: CART_GIFT_LIMITS.ip.perMinute,
        windowSec: MINUTE_SEC,
      },
      {
        key: `cart:gift:ip:${ipKey}:h`,
        limit: CART_GIFT_LIMITS.ip.perHour,
        windowSec: HOUR_SEC,
      },
    ];

    let retryAfter = 0;
    try {
      const multi = this.redis.client.multi();
      for (const c of checks) {
        // SET NX EX + INCR + TTL атомарно: ключ без TTL не остаётся.
        multi.set(c.key, '0', 'EX', c.windowSec, 'NX').incr(c.key).ttl(c.key);
      }
      const results = await multi.exec();
      // fail closed: exec() === null (транзакция отменена) или ошибка любой
      // команды не считаются нулевым счётчиком.
      if (!results || results.some(([err]) => err)) {
        throw new Error('redis multi failed');
      }
      checks.forEach((c, i) => {
        const count = Number(results[i * 3 + 1]?.[1] ?? 0);
        const ttl = Number(results[i * 3 + 2]?.[1] ?? c.windowSec);
        if (count > c.limit) {
          retryAfter = Math.max(retryAfter, ttl > 0 ? ttl : c.windowSec);
        }
      });
    } catch {
      throw new ServiceUnavailableException(
        'Сервис временно недоступен, попробуйте позже',
      );
    }

    if (retryAfter > 0) {
      http
        .getResponse<{ setHeader(name: string, v: string): void }>()
        .setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: StoreCartError.CART_GIFT_RATE_LIMITED,
          message: 'Слишком много операций с подарками. Попробуйте позже',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
