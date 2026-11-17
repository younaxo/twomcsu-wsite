import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { tooManyRequests, unauthorized, unavailable } from './bridge-errors';
import { BridgeRedisService } from './bridge-redis.service';
import { BridgeRequest } from './bridge.types';

/// Лимит запросов по `key-id` (5.4 контракта). Стоит ПОСЛЕ
/// `BridgeSignatureGuard`: до успешной подписи `key-id` несекретен, и аноним
/// иначе выбил бы лимит чужого ключа (2.3, п. 9). До подписи действуют только
/// грубый лимит по подсети (глобальный throttler) и счётчик неудачных
/// аутентификаций. Redis недоступен - 503.
@Injectable()
export class BridgeRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(BridgeRateLimitGuard.name);

  constructor(private readonly redis: BridgeRedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<BridgeRequest>();
    const res = http.getResponse<Response>();
    const keyId = req.bridge?.keyId;
    // Guard без предшествующей подписи не должен пропускать запрос.
    if (keyId === undefined) throw unauthorized();
    try {
      const slow = await this.redis.slowRetryAfter(keyId);
      if (slow > 0) throw tooManyRequests(res, slow);
      const retry = await this.redis.requestRetryAfter(keyId);
      if (retry > 0) {
        this.logger.warn(`bridge rate limit: requests key=${keyId}`);
        throw tooManyRequests(res, retry);
      }
      return true;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`bridge rate limit: redis_unavailable key=${keyId}`);
      throw unavailable(res, 5);
    }
  }
}
