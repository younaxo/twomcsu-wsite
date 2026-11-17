import * as express from 'express';
import * as request from 'supertest';
import { createBridgeBodyParser } from './bridge-body-parser';
import { BridgeConfig } from './bridge.config';

const SECRET = Buffer.from('test-master-secret-synthetic-0123456789-abcdef');
const cfg = (over: Partial<BridgeConfig> = {}): BridgeConfig => ({
  enabled: true,
  masterSecret: SECRET,
  timestampWindowS: 60,
  maxBodyBytes: 262_144,
  keyOverlapDays: 7,
  applyLatencyLimitMs: 2000,
  ...over,
});

function app(config: BridgeConfig) {
  const a = express();
  a.use(createBridgeBodyParser(config));
  // Глобальный парсер по умолчанию (100 КБ), как у Nest.
  a.use(express.json());
  a.post('/bridge/v1/events', (req, res) =>
    res.json({
      len: (req as express.Request & { rawBody?: Buffer }).rawBody?.length,
    }),
  );
  a.post('/other', (_req, res) => res.json({ ok: true }));
  a.use(
    (
      err: { status?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => res.status(err.status ?? 500).json({ error: 'global' }),
  );
  return a;
}

const body = (bytes: number) => JSON.stringify({ x: 'a'.repeat(bytes) });

describe('bridge body parser (M3)', () => {
  it('200 КБ на /bridge/v1 проходит, rawBody сохранён', async () => {
    const payload = body(200 * 1024);
    const res = await request(app(cfg()))
      .post('/bridge/v1/events')
      .set('content-type', 'application/json')
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body.len).toBe(Buffer.byteLength(payload));
  });

  it('300 КБ -> 413 payload_too_large', async () => {
    const res = await request(app(cfg()))
      .post('/bridge/v1/events')
      .set('content-type', 'application/json')
      .send(body(300 * 1024));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'payload_too_large' });
  });

  it('битый JSON -> 400 invalid_body без текста парсера', async () => {
    const res = await request(app(cfg()))
      .post('/bridge/v1/events')
      .set('content-type', 'application/json')
      .send('{"a":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_body' });
    expect(res.text).not.toMatch(/JSON|token|position/i);
  });

  it('выключенный Bridge -> 503 до парсинга', async () => {
    const res = await request(app(cfg({ enabled: false })))
      .post('/bridge/v1/events')
      .set('content-type', 'application/json')
      .send('{"a":');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'unavailable' });
  });

  it('другие маршруты сохраняют глобальный лимит 100 КБ', async () => {
    const res = await request(app(cfg()))
      .post('/other')
      .set('content-type', 'application/json')
      .send(body(200 * 1024));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'global' });
  });
});
