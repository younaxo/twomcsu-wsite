import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import { readGiveawayConfig } from './giveaway.config';
import { createGiveawayBodyParser } from './giveaway-body-parser';

const SECRET = 'test-master-secret-synthetic-0123456789-abcdef';
const cfg = (enabled = true) =>
  readGiveawayConfig({
    get: (k: string) =>
      (
        ({
          GIVEAWAY_ENABLED: enabled ? 'true' : 'false',
          GIVEAWAY_MASTER_SECRET: SECRET,
        }) as Record<string, string>
      )[k],
  } as never);

type Hit = { raw: Buffer | undefined; body: unknown };

function start(enabled = true) {
  const parser = createGiveawayBodyParser(cfg(enabled));
  const hits: Hit[] = [];
  const server = http.createServer((req, res) => {
    const r = req as unknown as Record<string, unknown>;
    r.originalUrl = req.url;
    const rs = res as unknown as Record<string, unknown>;
    rs.status = (c: number) => {
      res.statusCode = c;
      return res;
    };
    rs.json = (b: unknown) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(b));
    };
    parser(req as never, res as never, () => {
      hits.push({ raw: r.rawBody as Buffer | undefined, body: r.body });
      res.end('{"ok":true}');
    });
  });
  return new Promise<{ port: number; hits: Hit[]; close: () => Promise<void> }>(
    (resolve) =>
      server.listen(0, '127.0.0.1', () =>
        resolve({
          port: (server.address() as AddressInfo).port,
          hits,
          close: () => new Promise((r) => server.close(() => r())),
        }),
      ),
  );
}

function post(port: number, path: string, body: string | Buffer) {
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          connection: 'close',
        },
      },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    req.on('error', (e) => {
      // 413 может закрыть соединение до конца записи.
      if ((e as NodeJS.ErrnoException).code === 'ECONNRESET') {
        resolve({ status: 413, text: 'reset' });
      } else reject(e);
    });
    req.end(body);
  });
}

describe('giveaway: парсер тела (M1)', () => {
  it('нормальное тело проходит, rawBody доступен guard-у', async () => {
    const s = await start();
    const body = '{"schema":"twomc.giveaway.v1","events":[]}';
    const r = await post(s.port, '/api/giveaway/v1/events', body);
    expect(r.status).toBe(200);
    expect(s.hits[0].raw?.toString('utf8')).toBe(body);
    expect(s.hits[0].body).toEqual(JSON.parse(body));
    await s.close();
  });
  it('тело > 64 КБ (в т.ч. 70 КБ) -> 413 до разбора JSON', async () => {
    const s = await start();
    const big = JSON.stringify({ pad: 'x'.repeat(70_000) });
    const r = await post(s.port, '/giveaway/v1/events', big);
    expect(r.status).toBe(413);
    expect(s.hits).toHaveLength(0);
    await s.close();
  });
  it('ровно 64 КБ проходит', async () => {
    const s = await start();
    const pad = 'x'.repeat(65_536 - '{"pad":""}'.length);
    const r = await post(s.port, '/api/giveaway/v1/events', `{"pad":"${pad}"}`);
    expect(r.status).toBe(200);
    await s.close();
  });
  it('при выключенном флаге всегда 503 (и для большого тела)', async () => {
    const s = await start(false);
    const r = await post(s.port, '/api/giveaway/v1/events', 'x'.repeat(70_000));
    expect(r.status).toBe(503);
    await s.close();
  });
  it('чужие пути не затрагиваются', async () => {
    const s = await start();
    const r = await post(s.port, '/api/other', 'x'.repeat(70_000));
    expect(r.status).toBe(200);
    expect(s.hits[0].raw).toBeUndefined();
    await s.close();
  });
  it('невалидный JSON -> 400 invalid_body', async () => {
    const s = await start();
    const r = await post(s.port, '/api/giveaway/v1/events', '{bad');
    expect(r.status).toBe(400);
    await s.close();
  });
});
