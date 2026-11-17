import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { rateLimitKey } from '../../config/trust-proxy';

/// Глобальный throttler с ключом по подсети (Q21, ADR-0163): IPv4 — полный
/// адрес, IPv6 — префикс /64. Стандартный `ThrottlerGuard` берёт сырой
/// `req.ip`, и IPv6-клиент обходил лимит, меняя адрес внутри своей /64.
/// Метаданные `@Throttle`/`@SkipThrottle` читает базовый класс, их аргументы
/// не меняются; переопределён только трекер.
@Injectable()
export class IpSubnetThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const socket = req.socket as { remoteAddress?: unknown } | undefined;
    const ip = req.ip ?? socket?.remoteAddress;
    return Promise.resolve(rateLimitKey(typeof ip === 'string' ? ip : null));
  }
}
