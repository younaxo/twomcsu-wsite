import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

/// Коды Prisma, означающие «база сейчас занята», а не «запрос неверный»
/// (ADR-0183): ответ 503 `busy` с `Retry-After`, а не 500.
///  - P2028: транзакция не стартовала за `maxWait` или истекла по `timeout`;
///  - P2024: нет свободного соединения в пуле за `pool_timeout`;
///  - P2034: конфликт записи или взаимоблокировка (транзакция откатана целиком).
const BUSY_RETRY_AFTER_S: Record<string, number> = {
  P2028: 2,
  P2024: 2,
  P2034: 1,
};

/// Приёмник Bridge (контракт, раздел 2.3) отвечает телом `{ error: 'unavailable' }`.
const BRIDGE_PATH_PREFIX = '/bridge/v1';
const BRIDGE_RETRY_AFTER_S = 5;

export function isPrismaBusyCode(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUSY_RETRY_AFTER_S, code);
}

/// Глобальный фильтр ошибок Prisma. Текст и `meta` ошибки клиенту не уходят:
/// они содержат имена таблиц, полей и фрагменты запроса.
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(
    exception: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    if (host.getType() !== 'http') {
      this.logger.error(`Prisma ${exception.code} вне HTTP-контекста`);
      return;
    }
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();

    if (isPrismaBusyCode(exception.code)) {
      const path = (req.originalUrl ?? req.url ?? '').split('?')[0];
      const bridge = path.startsWith(BRIDGE_PATH_PREFIX);
      const retryAfter = bridge
        ? BRIDGE_RETRY_AFTER_S
        : BUSY_RETRY_AFTER_S[exception.code];
      this.logger.warn(`База занята: ${exception.code} ${req.method} ${path}`);
      res.setHeader('Retry-After', String(retryAfter));
      res.setHeader('Cache-Control', 'no-store');
      res.status(503).json(
        bridge
          ? { error: 'unavailable' }
          : {
              statusCode: 503,
              code: 'busy',
              message: 'Сервер занят, повторите запрос позже',
            },
      );
      return;
    }

    // Остальные коды - как у стандартного обработчика Nest (500 без деталей),
    // но с записью в лог: раньше ошибку логировал сам Nest.
    this.logger.error(
      `Необработанная ошибка Prisma ${exception.code}`,
      exception.stack,
    );
    res.status(500).json({ statusCode: 500, message: 'Internal server error' });
  }
}
