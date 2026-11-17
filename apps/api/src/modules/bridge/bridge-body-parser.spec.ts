import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import { createBridgeBodyParser } from './bridge-body-parser';
import { BridgeConfig } from './bridge.config';

const SECRET = Buffer.from('test-master-secret-synthetic-0123456789-abcdef');
const LIMIT = 262_144;
const cfg = (over: Partial<BridgeConfig> = {}): BridgeConfig => ({
  enabled: true,
  masterSecret: SECRET,
  timestampWindowS: 60,
  maxBodyBytes: LIMIT,
  keyOverlapDays: 7,
  applyLatencyLimitMs: 2000,
  ...over,
});

type Hit = { path: string; rawLen: number | undefined; body: unknown };

// Минимальный сервер без express: парсер + терминальный обработчик.
function start(config: BridgeConfig) {
  const parser = createBridgeBodyParser(config);
  const hits: Hit[] = [];
  const server = http.createServer((req, res) => {
    const r = req as unknown as Record<string, unknown>;
    r.originalUrl = req.url;
    const rs = res as unknown as {
      status: (c: number) => typeof rs;
      json: (b: unknown) => void;
      setHeader: (k: string, v: string) => void;
    };
    (res as unknown as Record<string, unknown>).status = (c: number) => {
      res.statusCode = c;
      return rs;
    };
    (res as unknown as Record<string, unknown>).json = (b: unknown) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(b));
    };
    parser(req as never, res as never, () => {
      hits.push({
        path: req.url ?? '',
        rawLen: (r.rawBody as Buffer | undefined)?.length,
        body: r.body,
      });
      res.end('{"ok":true}');
    });
  });
  return new Promise<{ port: number; hits: Hit[]; close: () => Promise<void> }>(
    (resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve({
          port: (server.address() as AddressInfo).port,
          hits,
          close: () =>
            new Promise<void>((r) => {
              server.closeAllConnections();
              server.close(() => r());
            }),
        });
      });
    },
  );
}

function post(
  port: number,
  path: string,
  body: Buffer | string,
  headers: Record<string, string> = { 'content-type': 'application/json' },
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const buf = typeof body === 'string' ? Buffer.from(body) : body;
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: { 'content-length': String(buf.length), ...headers },
      },
      (res) => {
        let text = '';
        res.on('data', (d) => (text += d));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    req.on('error', reject);
    req.end(buf);
  });
}

// JSON ровно заданной длины в байтах.
const jsonOfSize = (bytes: number): Buffer => {
  const overhead = Buffer.byteLength(JSON.stringify({ x: '' }));
  return Buffer.from(JSON.stringify({ x: 'a'.repeat(bytes - overhead) }));
};

describe('bridge body parser (M3, без express)', () => {
  let srv: Awaited<ReturnType<typeof start>>;
  afterEach(async () => {
    await srv.close();
  });

  it('ровно LIMIT байт проходит, rawBody сохранён', async () => {
    srv = await start(cfg());
    const payload = jsonOfSize(LIMIT);
    expect(payload.length).toBe(LIMIT);
    const res = await post(srv.port, '/bridge/v1/events', payload);
    expect(res.status).toBe(200);
    expect(srv.hits).toHaveLength(1);
    expect(srv.hits[0].rawLen).toBe(LIMIT);
  });

  it('LIMIT + 1 байт -> 413 payload_too_large', async () => {
    srv = await start(cfg());
    const res = await post(srv.port, '/bridge/v1/events', jsonOfSize(LIMIT + 1));
    expect(res.status).toBe(413);
    expect(JSON.parse(res.text)).toEqual({ error: 'payload_too_large' });
    expect(srv.hits).toHaveLength(0);
  });

  it('chunked без Content-Length: превышение прерывает чтение -> 413', async () => {
    srv = await start(cfg({ maxBodyBytes: 1024 }));
    const res = await new Promise<{ status: number; text: string }>(
      (resolve, reject) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port: srv.port,
            path: '/bridge/v1/events',
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'transfer-encoding': 'chunked',
            },
          },
          (r) => {
            let text = '';
            r.on('data', (d) => (text += d));
            r.on('end', () => resolve({ status: r.statusCode ?? 0, text }));
          },
        );
        req.on('error', reject);
        req.write('{"x":"' + 'a'.repeat(900));
        req.write('a'.repeat(900));
        req.end('"}');
      },
    );
    expect(res.status).toBe(413);
    expect(srv.hits).toHaveLength(0);
  });

  it('медленный поток в пределах лимита собирается целиком', async () => {
    srv = await start(cfg());
    const parts = ['{"a"', ':', '"b', 'c"}'];
    const res = await new Promise<{ status: number }>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: srv.port,
          path: '/bridge/v1/events',
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'transfer-encoding': 'chunked',
          },
        },
        (r) => {
          r.resume();
          r.on('end', () => resolve({ status: r.statusCode ?? 0 }));
        },
      );
      req.on('error', reject);
      let i = 0;
      const tick = (): void => {
        if (i >= parts.length) {
          req.end();
          return;
        }
        req.write(parts[i++]);
        setTimeout(tick, 30);
      };
      tick();
    });
    expect(res.status).toBe(200);
    expect(srv.hits[0].body).toEqual({ a: 'bc' });
    expect(srv.hits[0].rawLen).toBe(Buffer.byteLength('{"a":"bc"}'));
  });

  it('обрыв соединения посреди тела: обработчик не вызывается, процесс жив', async () => {
    srv = await start(cfg());
    await new Promise<void>((resolve) => {
      const req = http.request({
        host: '127.0.0.1',
        port: srv.port,
        path: '/bridge/v1/events',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'transfer-encoding': 'chunked',
        },
      });
      req.on('error', () => resolve());
      req.write('{"a":');
      setTimeout(() => req.destroy(), 50);
      setTimeout(() => resolve(), 300);
    });
    await new Promise((r) => setTimeout(r, 100));
    expect(srv.hits).toHaveLength(0);
    // Сервер продолжает отвечать.
    const ok = await post(srv.port, '/bridge/v1/events', '{"a":1}');
    expect(ok.status).toBe(200);
  });

  it('битый JSON -> 400 invalid_body без текста ошибки', async () => {
    srv = await start(cfg());
    const res = await post(srv.port, '/bridge/v1/events', '{"a":');
    expect(res.status).toBe(400);
    expect(JSON.parse(res.text)).toEqual({ error: 'invalid_body' });
    expect(res.text).not.toMatch(/JSON|token|position/i);
    expect(srv.hits).toHaveLength(0);
  });

  it('примитив вместо объекта/массива -> 400 invalid_body', async () => {
    srv = await start(cfg());
    const res = await post(srv.port, '/bridge/v1/events', '"str"');
    expect(res.status).toBe(400);
  });

  it('Content-Encoding запрещён -> 415, тело не читается', async () => {
    srv = await start(cfg());
    const res = await post(srv.port, '/bridge/v1/events', '{"a":1}', {
      'content-type': 'application/json',
      'content-encoding': 'gzip',
    });
    expect(res.status).toBe(415);
    expect(JSON.parse(res.text)).toEqual({ error: 'unsupported_encoding' });
    expect(srv.hits).toHaveLength(0);
  });

  it('выключенный Bridge -> 503 до чтения тела', async () => {
    srv = await start(cfg({ enabled: false }));
    const res = await post(srv.port, '/bridge/v1/events', '{"a":');
    expect(res.status).toBe(503);
    expect(JSON.parse(res.text)).toEqual({ error: 'unavailable' });
  });

  it('пути вне /bridge/v1 не затрагиваются', async () => {
    srv = await start(cfg());
    const res = await post(srv.port, '/other', jsonOfSize(LIMIT + 1000));
    expect(res.status).toBe(200);
    expect(srv.hits[0].rawLen).toBeUndefined();
  });
});
