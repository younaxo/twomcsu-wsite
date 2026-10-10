import { Injectable, Logger } from '@nestjs/common';
import { lookup as dnsLookup, type LookupAddress } from 'dns';
import { request as httpRequest, type IncomingMessage } from 'http';
import { request as httpsRequest } from 'https';
import { isIP, type LookupFunction } from 'net';
import { RedisService } from '../redis/redis.service';
import { isPublicAddress } from './ip-guard';

/// Иконка сайта для подтверждения внешнего перехода (ADR-0102). Сервер сам
/// ходит по адресу пользователя, поэтому всё — с защитой от SSRF:
/// - только http/https на стандартных портах, без логина/пароля в URL;
/// - адрес проверяется в момент соединения (свой `lookup`): все IP, в которые
///   резолвится хост, должны быть публичными — это закрывает и DNS-rebinding;
///   IP-литералы проверяются так же;
/// - каждый redirect (≤ 3) проходит те же проверки;
/// - таймаут 3 с, ответ ≤ 64 КБ, формат — только по сигнатуре байтов
///   (ICO/PNG/GIF/JPEG/WebP; SVG не принимается — это документ со скриптами);
/// - результат и «иконки нет» кэшируются в Redis по хосту.
/// Берётся только `/favicon.ico` origin'а — HTML чужой страницы не разбирается.

export const FAVICON_MAX_BYTES = 64 * 1024;
const TIMEOUT_MS = 3000;
const MAX_REDIRECTS = 3;
const TTL_FOUND = 24 * 60 * 60;
const TTL_MISSING = 6 * 60 * 60;
const CACHE_PREFIX = 'favicon:v1:';

export interface FaviconResult {
  mime: string;
  body: Buffer;
}

export interface RawResponse {
  status: number;
  location: string | null;
  body: Buffer | null;
}

/// Origin для резолвера или null — небезопасный/неподдерживаемый адрес.
export function normalizeOrigin(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!isFetchable(url)) return null;
  return new URL(url.origin);
}

/// Можно ли вообще пытаться подключаться к этому адресу.
export function isFetchable(url: URL): boolean {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80'))
    return false;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost'))
    return false;
  if (isIP(host)) return isPublicAddress(host);
  // Однословные имена (intranet) и внутренние зоны — мимо.
  if (!host.includes('.') || /\.(local|internal|lan|home|corp)$/i.test(host))
    return false;
  return true;
}

/// Формат по первым байтам; null — не картинка из разрешённого набора.
export function sniffImage(body: Buffer): string | null {
  if (body.length < 4) return null;
  if (body[0] === 0x89 && body.toString('latin1', 1, 4) === 'PNG')
    return 'image/png';
  if (
    body[0] === 0x00 &&
    body[1] === 0x00 &&
    body[2] === 0x01 &&
    body[3] === 0x00
  ) {
    return 'image/x-icon';
  }
  if (body.toString('latin1', 0, 4) === 'GIF8') return 'image/gif';
  if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff)
    return 'image/jpeg';
  if (
    body.length >= 12 &&
    body.toString('latin1', 0, 4) === 'RIFF' &&
    body.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/// `lookup` для http(s): резолвит хост и пропускает соединение, только если
/// все адреса публичные.
export const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { all: true }, (error, addresses) => {
    if (error) {
      callback(error, '', 4);
      return;
    }
    const list = addresses as LookupAddress[];
    if (
      list.length === 0 ||
      list.some((entry) => !isPublicAddress(entry.address))
    ) {
      callback(
        Object.assign(new Error('blocked address'), { code: 'EBLOCKED' }),
        '',
        4,
      );
      return;
    }
    if ((options as { all?: boolean }).all) {
      (callback as unknown as (err: null, all: LookupAddress[]) => void)(
        null,
        list,
      );
      return;
    }
    callback(null, list[0]!.address, list[0]!.family);
  });
};

@Injectable()
export class FaviconService {
  private readonly logger = new Logger(FaviconService.name);

  constructor(private readonly redis: RedisService) {}

  async favicon(raw: string): Promise<FaviconResult | null> {
    const origin = normalizeOrigin(raw);
    if (!origin) return null;
    const key = `${CACHE_PREFIX}${origin.host}`;
    try {
      const cached = await this.redis.client.get(key);
      if (cached === 'none') return null;
      if (cached) {
        const parsed = JSON.parse(cached) as { mime: string; b64: string };
        return { mime: parsed.mime, body: Buffer.from(parsed.b64, 'base64') };
      }
    } catch {
      // Кэш недоступен — просто без кэша.
    }
    const result = await this.fetchFavicon(
      new URL('/favicon.ico', origin),
    ).catch(() => null);
    try {
      if (result) {
        await this.redis.client.set(
          key,
          JSON.stringify({
            mime: result.mime,
            b64: result.body.toString('base64'),
          }),
          'EX',
          TTL_FOUND,
        );
      } else {
        await this.redis.client.set(key, 'none', 'EX', TTL_MISSING);
      }
    } catch {
      // Без кэша — следующий запрос повторит загрузку.
    }
    return result;
  }

  async fetchFavicon(start: URL): Promise<FaviconResult | null> {
    let current = start;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (!isFetchable(current)) return null;
      const response = await this.request(current);
      if (
        [301, 302, 303, 307, 308].includes(response.status) &&
        response.location
      ) {
        try {
          current = new URL(response.location, current);
        } catch {
          return null;
        }
        continue;
      }
      if (response.status !== 200 || !response.body) return null;
      const mime = sniffImage(response.body);
      return mime ? { mime, body: response.body } : null;
    }
    return null;
  }

  /// Один GET без автоматических redirect, с проверкой адреса при соединении.
  request(url: URL): Promise<RawResponse> {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    return new Promise((resolve) => {
      const done = (value: RawResponse) => resolve(value);
      const req = send(
        url,
        {
          method: 'GET',
          lookup: safeLookup,
          timeout: TIMEOUT_MS,
          headers: {
            'user-agent': 'TwoMC-LinkPreview/1.0 (+https://twomc.su)',
            accept: 'image/*',
          },
        },
        (res: IncomingMessage) => {
          const status = res.statusCode ?? 0;
          const location =
            typeof res.headers.location === 'string'
              ? res.headers.location
              : null;
          if (status !== 200) {
            res.resume();
            done({ status, location, body: null });
            return;
          }
          const declared = Number(res.headers['content-length'] ?? 0);
          if (declared > FAVICON_MAX_BYTES) {
            res.destroy();
            done({ status: 413, location: null, body: null });
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > FAVICON_MAX_BYTES) {
              res.destroy();
              done({ status: 413, location: null, body: null });
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () =>
            done({ status, location, body: Buffer.concat(chunks) }),
          );
          res.on('error', () =>
            done({ status: 0, location: null, body: null }),
          );
        },
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', (error) => {
        this.logger.debug(`favicon ${url.host}: ${error.message}`);
        done({ status: 0, location: null, body: null });
      });
      req.end();
    });
  }
}
