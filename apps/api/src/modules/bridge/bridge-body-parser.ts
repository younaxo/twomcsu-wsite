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
/// буферизуется), 415 при `Content-Encoding`, 408 `request_timeout` при
/// превышении `BRIDGE_BODY_READ_TIMEOUT_MS`, иначе 400 `invalid_body` (в т.ч.
/// невалидный UTF-8) без текста ошибки разбора. Префикс пути сопоставляется
/// без учёта регистра и по части до `?`. При выключенном/ненастроенном Bridge - 503 до
/// чтения тела. Не-JSON content-type пропускается дальше без чтения.
type ParsedRequest = Request & { rawBody?: Buffer; _body?: boolean };

function isJsonContentType(value: string | undefined): boolean {
  if (value === undefined) return false;
  const base = value.split(';', 1)[0].trim().toLowerCase();
  return base === 'application/json';
}

export function createBridgeBodyParser(config: BridgeConfig): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const path = req.originalUrl.split('?', 1)[0].toLowerCase();
    if (path !== BRIDGE_PATH_PREFIX && !path.startsWith(`${BRIDGE_PATH_PREFIX}/`)) {
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
    let timer: NodeJS.Timeout | null = null;

    // Дедлайн чтения тела (F1): slow-body не удерживает соединение и буфер.
    const onTimeout = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      chunks.length = 0;
      received = 0;
      if (res.headersSent) {
        req.destroy();
        return;
      }
      res.setHeader('Connection', 'close');
      res.status(408).json({ error: 'request_timeout' });
      // Остаток тела отбрасывается; соединение закрывается после ответа.
      res.once('finish', () => req.destroy());
      req.resume();
    };

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
      let parsed: unknown = {};
      if (raw.length > 0) {
        // Строгий UTF-8 (F4): невалидные байты не заменяются на U+FFFD.
        // BOM не отбрасывается (ignoreBOM) - JSON с BOM отклоняется как раньше.
        let text: string;
        try {
          text = new TextDecoder('utf-8', {
            fatal: true,
            ignoreBOM: true,
          }).decode(raw);
        } catch {
          res.status(400).json({ error: 'invalid_body' });
          return;
        }
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
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
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

    timer = setTimeout(onTimeout, config.bodyReadTimeoutMs);
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('close', onClose);
    req.on('error', onError);
  };
}
