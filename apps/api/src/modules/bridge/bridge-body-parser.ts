import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { BridgeConfig, isBridgeOperational } from './bridge.config';
import { BRIDGE_PATH_PREFIX } from './bridge.constants';

/// Парсер тела только для путей `/bridge/v1` (M3): лимит JSON равен
/// `BRIDGE_MAX_BODY_BYTES` (handshake отдаёт то же значение), а не 100 КБ
/// глобального парсера. Подключается в `configureApp` до глобальных парсеров
/// Nest; те пропускают уже разобранное тело (`_body`), поэтому поведение
/// остальных маршрутов не меняется. Сырое тело сохраняется в `req.rawBody`
/// для HMAC. Реализован на node-потоке без прямого импорта `express`/
/// `body-parser` (их нет среди зависимостей apps/api).
///
/// Ошибки: 413 при превышении лимита (чтение прерывается, лишнее не
/// буферизуется), 415 при `Content-Encoding`, иначе 400 `invalid_body` без
/// текста ошибки разбора. При выключенном/ненастроенном Bridge - 503 до
/// чтения тела. Не-JSON content-type пропускается дальше без чтения.
type ParsedRequest = Request & { rawBody?: Buffer; _body?: boolean };

function isJsonContentType(value: string | undefined): boolean {
  if (value === undefined) return false;
  const base = value.split(';', 1)[0].trim().toLowerCase();
  return base === 'application/json';
}

export function createBridgeBodyParser(config: BridgeConfig): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const url = req.originalUrl;
    if (url !== BRIDGE_PATH_PREFIX && !url.startsWith(`${BRIDGE_PATH_PREFIX}/`)) {
      next();
      return;
    }
    if (!isBridgeOperational(config) || config.masterSecret === null) {
      res.setHeader('Retry-After', '5');
      res.status(503).json({ error: 'unavailable' });
      return;
    }
    if (!isJsonContentType(req.headers['content-type'])) {
      next();
      return;
    }

    const limit = config.maxBodyBytes;
    let settled = false;
    const reject = (status: number, error: string): void => {
      if (settled) return;
      settled = true;
      cleanup();
      res.setHeader('Connection', 'close');
      res.status(status).json({ error });
      // Остаток тела отбрасывается без буферизации.
      req.resume();
    };

    const chunks: Buffer[] = [];
    let received = 0;

    const onData = (chunk: Buffer | string): void => {
      if (settled) return;
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      received += buf.length;
      if (received > limit) {
        chunks.length = 0;
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
      const text = raw.toString('utf8');
      let parsed: unknown = {};
      if (raw.length > 0) {
        const first = text.trimStart()[0];
        if (first !== '{' && first !== '[') {
          res.status(400).json({ error: 'invalid_body' });
          return;
        }
        try {
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
    // Обрыв соединения: тело не дочитано, дальше не идём.
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
      if (!res.headersSent) {
        res.status(400).json({ error: 'invalid_body' });
      }
    };
    function cleanup(): void {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('close', onClose);
      req.removeListener('error', onError);
      // После cleanup ошибки потока не должны ронять процесс.
      req.on('error', () => undefined);
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
    const declared = req.headers['content-length'];
    if (declared !== undefined) {
      const n = Number(declared);
      if (Number.isFinite(n) && n > limit) {
        reject(413, 'payload_too_large');
        return;
      }
    }

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('close', onClose);
    req.on('error', onError);
  };
}
