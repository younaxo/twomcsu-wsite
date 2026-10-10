import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { FAVICON_MAX_BYTES, FaviconService } from './favicon.service';

/// Живой сетевой код `request()` на локальном сервере. Проверка адресов здесь
/// отключена (локальный сервер — 127.0.0.1); сама она покрыта в ip-guard.spec.
jest.mock('./ip-guard', () => ({ isPublicAddress: () => true }));

const ICO = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);

describe('FaviconService.request — живой HTTP', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/ok') {
        res.writeHead(200, { 'content-type': 'image/x-icon' }).end(ICO);
      } else if (req.url === '/redirect') {
        res.writeHead(302, { location: 'http://169.254.169.254/' }).end();
      } else if (req.url === '/declared-big') {
        res.writeHead(200, { 'content-length': String(FAVICON_MAX_BYTES + 1) });
        res.end(Buffer.alloc(FAVICON_MAX_BYTES + 1));
      } else if (req.url === '/streamed-big') {
        res.writeHead(200, { 'transfer-encoding': 'chunked' });
        res.write(Buffer.alloc(40 * 1024));
        res.end(Buffer.alloc(40 * 1024));
      } else {
        res.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const svc = new FaviconService({ client: {} } as never);

  it('200 — тело целиком', async () => {
    const res = await svc.request(new URL(`${base}/ok`));
    expect(res.status).toBe(200);
    expect(res.body?.equals(ICO)).toBe(true);
  });

  it('redirect не выполняется сам — возвращается Location для проверки', async () => {
    const res = await svc.request(new URL(`${base}/redirect`));
    expect(res.status).toBe(302);
    expect(res.location).toBe('http://169.254.169.254/');
    expect(res.body).toBeNull();
  });

  it('больше 64 КБ — отказ и по заголовку, и по потоку', async () => {
    expect((await svc.request(new URL(`${base}/declared-big`))).status).toBe(
      413,
    );
    expect((await svc.request(new URL(`${base}/streamed-big`))).status).toBe(
      413,
    );
  });

  it('нет иконки — статус без тела', async () => {
    const res = await svc.request(new URL(`${base}/missing`));
    expect(res.status).toBe(404);
    expect(res.body).toBeNull();
  });
});
