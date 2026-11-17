import {
  ArgumentsHost,
  CanActivate,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { punishmentsPublicDisabled } from './punishments-errors';
import { PunishmentsSettingsService } from './punishments-settings.service';
import { weakEtag } from './punishments-view';

/// HTTP-обвязка публичного и служебного слоёв наказаний (контракт 5, 6.1).

export const PUBLIC_CACHE_CONTROL =
  'public, max-age=15, stale-while-revalidate=30';
export const NO_STORE = 'private, no-store';

/// Шаг 3 порядка проверок: «раздел выключен» - guard (до ValidationPipe),
/// иначе запрос с неверным query получил бы 400 вместо 404.
@Injectable()
export class PunishmentsPublicEnabledGuard implements CanActivate {
  constructor(private readonly settings: PunishmentsSettingsService) {}

  async canActivate(): Promise<boolean> {
    if (await this.settings.isPublicEnabled()) return true;
    throw punishmentsPublicDisabled();
  }
}

/// Заголовки ошибок (6.1): `no-store` всегда; `noindex` для 404 и 503;
/// `Retry-After: 60` для 503. Тело - как у стандартного обработчика Nest.
@Catch(HttpException)
export class PunishmentsErrorHeadersFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const response = exception.getResponse();
    const body =
      typeof response === 'string'
        ? { statusCode: status, message: response }
        : response;
    res.setHeader('Cache-Control', 'no-store');
    if (status === 404 || status === 503) {
      res.setHeader('X-Robots-Tag', 'noindex');
    }
    if (status === 503) res.setHeader('Retry-After', '60');
    res.status(status).json(body);
  }
}

/// Сравнение `If-None-Match` со слабым ETag (слабое сравнение, список, `*`).
export function etagMatches(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  const strip = (v: string): string => v.trim().replace(/^W\//, '');
  const target = strip(etag);
  return header
    .split(',')
    .some(
      (candidate) => candidate.trim() === '*' || strip(candidate) === target,
    );
}

/// Публичный успех: ETag без `generatedAt`, `Cache-Control`, `noindex`; 304
/// только поверх 200 (ошибки сюда не попадают).
export function sendPublic<T extends { meta: { generatedAt: string } }>(
  req: Request,
  res: Response,
  body: T,
): T | undefined {
  const etag = weakEtag(body as unknown as Parameters<typeof weakEtag>[0]);
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', PUBLIC_CACHE_CONTROL);
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (etagMatches(req.headers['if-none-match'], etag)) {
    res.status(304);
    return undefined;
  }
  return body;
}

/// «Мои» и admin: без кэша и без ETag.
export function setPrivateNoStore(res: Response): void {
  res.setHeader('Cache-Control', NO_STORE);
  res.setHeader('Vary', 'Authorization');
}
