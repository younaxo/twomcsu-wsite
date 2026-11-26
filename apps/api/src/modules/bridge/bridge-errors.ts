import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';

/// Все отказы аутентификации имеют одинаковое тело без деталей (2.3, п. 7).
export function unauthorized(): UnauthorizedException {
  return new UnauthorizedException({ error: 'unauthorized' });
}

/// Приёмник выключен, не настроен или недоступен Redis/БД: тело без деталей.
export function unavailable(
  res?: Response,
  retryAfterS?: number,
): ServiceUnavailableException {
  if (res !== undefined && retryAfterS !== undefined) {
    res.setHeader('Retry-After', String(retryAfterS));
  }
  return new ServiceUnavailableException({ error: 'unavailable' });
}

export function tooManyRequests(
  res: Response,
  retryAfterS: number,
): HttpException {
  res.setHeader('Retry-After', String(Math.max(1, Math.ceil(retryAfterS))));
  return new HttpException(
    { error: 'rate_limited' },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

export function payloadTooLarge(): HttpException {
  return new HttpException(
    { error: 'payload_too_large' },
    HttpStatus.PAYLOAD_TOO_LARGE,
  );
}

export function unsupportedProtocol(): HttpException {
  return new HttpException({ error: 'unsupported_protocol' }, 426);
}

export function invalidEnvelope(): HttpException {
  return new HttpException(
    { error: 'invalid_envelope' },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

/// У сервера нет нужной возможности (`capabilities`, 2.4 контракта).
export function forbidden(): ForbiddenException {
  return new ForbiddenException({ error: 'capability_missing' });
}
