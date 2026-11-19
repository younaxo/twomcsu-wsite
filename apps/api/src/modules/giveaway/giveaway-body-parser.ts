import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { GiveawayConfig, isGiveawayOperational } from './giveaway.config';
import { GIVEAWAY_PATH_PREFIXES, MAX_BODY_BYTES } from './giveaway.constants';

/// Парсер тела только для путей `/api/giveaway/v1` и `/giveaway/v1` (M1):
/// лимит `MAX_BODY_BYTES` (64 КБ) действует ДО глобального парсера Nest
/// (100 КБ) и до разбора JSON. Подключается в `configureApp` до глобальных
/// парсеров; те пропускают уже разобранное тело (`_body`). Сырое тело
/// сохраняется в `req.rawBody` для подписи. Образец - bridge-body-parser.
///
/// Порядок ответов: выключено/не настроено - 503 до чтения тела (не раскрывает
/// больше, чем guard); `Content-Encoding` - 415; заявленный или фактический
/// размер > лимита - 413 (чтение прерывается); таймаут чтения - 408; плохой
/// UTF-8/JSON - 400 `invalid_body` без текста ошибки. Не-JSON content-type
/// пропускается дальше без чтения (подпись тогда не сойдётся).
type ParsedRequest = Request & { rawBody?: Buffer; _body?: boolean };

export const GIVEAWAY_BODY_READ_TIMEOUT_MS = 10_000;

function isJsonContentType(value: string | undefined): boolean {
  if (value === undefined) return false;
  return value.split(';', 1)[0].trim().toLowerCase() === 'application/json';
}

function matchesPrefix(path: string): boolean {
  return GIVEAWAY_PATH_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );
}

export function createGiveawayBodyParser(
  config: GiveawayConfig,
  limit: number = MAX_BODY_BYTES,
  readTimeoutMs: number = GIVEAWAY_BODY_READ_TIMEOUT_MS,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const path = req.originalUrl.split('?', 1)[0].toLowerCase();
    if (!matchesPrefix(path)) {
      next();
      return;
    }
    if (!isGiveawayOperational(config)) {
      res.setHeader('Retry-After', '5');
      res.status(503).json({ error: 'unavailable' });
      return;
    }

    let settled = false;
    let timer: NodeJS.Timeout | null = null;
    const chunks: Buffer[] = [];
    let received = 0;

    const reject = (status: number, error: string): void => {
      if (settled) return;
      settled = true;
      cleanup();
      chunks.length = 0;
      res.setHeader('Connection', 'close');
      res.status(status).json({ error });
      req.resume();
    };
    const onTimeout = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      chunks.length = 0;
      if (res.headersSent) {
        req.destroy();
        return;
      }
      res.setHeader('Connection', 'close');
      res.status(408).json({ error: 'request_timeout' });
      res.once('finish', () => req.destroy());
      req.resume();
    };
    const onData = (chunk: Buffer | string): void => {
      if (settled) return;
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      received += buf.length;
      if (received > limit) {
        reject(413, 'payload_too_large');
        return;
      }
      chunks.push(buf);
    };
    const onEnd = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      const raw = Buffer.concat(chunks, received);
      let parsed: unknown = {};
      if (raw.length > 0) {
        try {
          const text = new TextDecoder('utf-8', {
            fatal: true,
            ignoreBOM: true,
          }).decode(raw);
          const first = text.trimStart()[0];
          if (first !== '{' && first !== '[') throw new Error('shape');
          parsed = JSON.parse(text);
        } catch {
          res.status(400).json({ error: 'invalid_body' });
          return;
        }
      }
      const parsedReq = req as ParsedRequest;
      parsedReq.rawBody = raw;
      parsedReq._body = true;
      req.body = parsed;
      next();
    };
    const onClose = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      chunks.length = 0;
    };
    const onError = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      chunks.length = 0;
      if (!res.headersSent) res.status(400).json({ error: 'invalid_body' });
    };
    function cleanup(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('close', onClose);
      req.removeListener('error', onError);
      req.on('error', () => undefined);
    }

    const declared = req.headers['content-length'];
    if (declared !== undefined) {
      const n = Number(declared);
      if (Number.isFinite(n) && n > limit) {
        reject(413, 'payload_too_large');
        return;
      }
    }
    if (!isJsonContentType(req.headers['content-type'])) {
      next();
      return;
    }
    const encoding = req.headers['content-encoding'];
    if (
      encoding !== undefined &&
      encoding.trim() !== '' &&
      encoding.trim().toLowerCase() !== 'identity'
    ) {
      reject(415, 'unsupported_encoding');
      return;
    }

    timer = setTimeout(onTimeout, readTimeoutMs);
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('close', onClose);
    req.on('error', onError);
  };
}
