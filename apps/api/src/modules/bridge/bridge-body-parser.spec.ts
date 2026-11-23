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
  bodyReadTimeoutMs: 10000,
  deliveryEnabled: false,
  ...over,
});

type Hit = {
  path: string;
  rawLen: number | undefined;
  raw: Buffer | undefined;
  body: unknown;
};

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
        raw: r.rawBody as Buffer | undefined,
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
    const res = await post(
      srv.port,
      '/bridge/v1/events',
      jsonOfSize(LIMIT + 1),
    );
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

  describe('дедлайн чтения тела (F1)', () => {
    it('медленный поток дольше дедлайна -> 408 request_timeout, Connection: close', async () => {
      srv = await start(cfg({ bodyReadTimeoutMs: 150 }));
      const res = await new Promise<{
        status: number;
        text: string;
        connection: string | undefined;
      }>((resolve, reject) => {
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
            r.on('end', () =>
              resolve({
                status: r.statusCode ?? 0,
                text,
                connection: r.headers.connection,
              }),
            );
          },
        );
        req.on('error', reject);
        req.write('{"a":');
        // Клиент не дописывает тело до ответа сервера.
        setTimeout(() => req.write('1'), 60);
      });
      expect(res.status).toBe(408);
      expect(JSON.parse(res.text)).toEqual({ error: 'request_timeout' });
      expect(res.connection).toBe('close');
      expect(srv.hits).toHaveLength(0);
    });

    it('тело, уложившееся в дедлайн, проходит (таймер очищен)', async () => {
      srv = await start(cfg({ bodyReadTimeoutMs: 1000 }));
      const res = await post(srv.port, '/bridge/v1/events', '{"a":1}');
      expect(res.status).toBe(200);
      // Дальнейшие запросы не получают позднего 408.
      await new Promise((r) => setTimeout(r, 1200));
      expect(srv.hits).toHaveLength(1);
    });
  });

  describe('сопоставление префикса (F3)', () => {
    it.each(['/BRIDGE/v1/events', '/bridge/v1/events?x=1', '/Bridge/V1'])(
      '%s попадает в парсер',
      async (path) => {
        srv = await start(cfg());
        const res = await post(srv.port, path, '{"a":');
        expect(res.status).toBe(400);
        expect(JSON.parse(res.text)).toEqual({ error: 'invalid_body' });
      },
    );

    it('выключенный Bridge: /BRIDGE/v1/x -> 503', async () => {
      srv = await start(cfg({ enabled: false }));
      const res = await post(srv.port, '/BRIDGE/v1/x', '{}');
      expect(res.status).toBe(503);
    });

    it('/bridge/v10 и /bridgex не считаются префиксом', async () => {
      srv = await start(cfg());
      const a = await post(srv.port, '/bridge/v10', '{"a":');
      const b = await post(srv.port, '/bridgex/v1', '{"a":');
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
    });
  });

  describe('строгий UTF-8 и rawBody (F4)', () => {
    it('не-ASCII: rawBody побайтно равен телу', async () => {
      srv = await start(cfg());
      const body = Buffer.from('{"name":"Привет, мир ✓ 😀"}', 'utf8');
      const res = await post(srv.port, '/bridge/v1/events', body);
      expect(res.status).toBe(200);
      expect(srv.hits[0].raw?.equals(body)).toBe(true);
      expect(srv.hits[0].body).toEqual({ name: 'Привет, мир ✓ 😀' });
    });

    it('невалидный UTF-8 -> 400 invalid_body', async () => {
      srv = await start(cfg());
      const body = Buffer.concat([
        Buffer.from('{"a":"'),
        Buffer.from([0xff, 0xfe, 0xc3]),
        Buffer.from('"}'),
      ]);
      const res = await post(srv.port, '/bridge/v1/events', body);
      expect(res.status).toBe(400);
      expect(JSON.parse(res.text)).toEqual({ error: 'invalid_body' });
      expect(srv.hits).toHaveLength(0);
    });

    it('BOM не отбрасывается молча: 400 invalid_body', async () => {
      srv = await start(cfg());
      const body = Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from('{"a":1}'),
      ]);
      const res = await post(srv.port, '/bridge/v1/events', body);
      expect(res.status).toBe(400);
      expect(srv.hits).toHaveLength(0);
    });

    it('Content-Type с charset и в верхнем регистре принимается', async () => {
      srv = await start(cfg());
      const body = Buffer.from('{"k":"é"}', 'utf8');
      const res = await post(srv.port, '/bridge/v1/events', body, {
        'content-type': 'Application/JSON; charset=UTF-8',
      });
      expect(res.status).toBe(200);
      expect(srv.hits[0].raw?.equals(body)).toBe(true);
      expect(srv.hits[0].body).toEqual({ k: 'é' });
    });
  });
});
