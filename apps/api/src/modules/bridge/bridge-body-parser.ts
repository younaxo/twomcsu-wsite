import * as express from 'express';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import { BridgeConfig, isBridgeOperational } from './bridge.config';
import { BRIDGE_PATH_PREFIX } from './bridge.constants';

/// Парсер тела только для путей `/bridge/v1` (M3): лимит JSON равен
/// `BRIDGE_MAX_BODY_BYTES` (handshake отдаёт то же значение), а не 100 КБ
/// глобального парсера. Подключается в `configureApp` до глобальных парсеров
/// Nest; те пропускают уже разобранное тело, поэтому поведение остальных
/// маршрутов не меняется. Сырое тело сохраняется в `req.rawBody` для HMAC.
/// Ошибки парсера: 413 при превышении, иначе 400 `invalid_body` без текста
/// парсера. При выключенном/ненастроенном Bridge - 503 до чтения тела.
export function createBridgeBodyParser(config: BridgeConfig): RequestHandler {
  const json = express.json({
    limit: config.maxBodyBytes,
    type: 'application/json',
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  });
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
    json(req, res, (err?: unknown) => {
      if (err === undefined || err === null) {
        next();
        return;
      }
      const type = (err as { type?: string }).type;
      if (type === 'entity.too.large') {
        res.status(413).json({ error: 'payload_too_large' });
        return;
      }
      res.status(400).json({ error: 'invalid_body' });
    });
  };
}
