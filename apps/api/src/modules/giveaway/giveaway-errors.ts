import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';

export const unauthorized = () =>
  new UnauthorizedException({ error: 'unauthorized' });
export const forbidden = () => new ForbiddenException({ error: 'forbidden' });
export const payloadTooLarge = () =>
  new HttpException(
    { error: 'payload_too_large' },
    HttpStatus.PAYLOAD_TOO_LARGE,
  );
export const invalidEnvelope = () =>
  new HttpException(
    { error: 'invalid_envelope' },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );

export function unavailable(
  res?: Response,
  retryAfterS?: number,
): ServiceUnavailableException {
  if (res !== undefined && retryAfterS !== undefined) {
    res.setHeader('Retry-After', String(retryAfterS));
  }
  return new ServiceUnavailableException({ error: 'unavailable' });
}

export function tooManyRequests(res: Response, retryAfterS: number) {
  res.setHeader('Retry-After', String(Math.max(1, Math.ceil(retryAfterS))));
  return new HttpException(
    { error: 'rate_limited' },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
