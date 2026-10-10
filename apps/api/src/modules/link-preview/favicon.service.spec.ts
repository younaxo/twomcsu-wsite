import {
  FAVICON_MAX_BYTES,
  FaviconService,
  isFetchable,
  normalizeOrigin,
  sniffImage,
  type RawResponse,
} from './favicon.service';

/// Иконка сайта для внешней ссылки (ADR-0102): SSRF, redirect, размер, формат.

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const ICO = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);
const HTML = Buffer.from('<!doctype html><html></html>');

function redisStub() {
  const store = new Map<string, string>();
  return {
    store,
    client: {
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      set: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      }),
    },
  };
}

function service(responses: Record<string, RawResponse>) {
  const redis = redisStub();
  const svc = new FaviconService(redis as never);
  const calls: string[] = [];
  jest.spyOn(svc, 'request').mockImplementation(async (url: URL) => {
    calls.push(url.href);
    return responses[url.href] ?? { status: 404, location: null, body: null };
  });
  return { svc, redis, calls };
}

describe('normalizeOrigin / isFetchable', () => {
  it('только http/https на стандартных портах, без логина в URL', () => {
    expect(normalizeOrigin('https://reallyworld.ru/news/1?x=1')?.href).toBe(
      'https://reallyworld.ru/',
    );
    expect(normalizeOrigin('http://example.com:80/a')?.href).toBe(
      'http://example.com/',
    );
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,x',
      'file:///etc/passwd',
      'ftp://example.com',
      'https://user:pass@example.com',
      'https://example.com:8443',
      'http://localhost/',
      'http://admin.localhost/',
      'http://127.0.0.1/',
      'http://[::1]/',
      'http://169.254.169.254/latest/meta-data',
      'http://10.0.0.1/',
      'http://intranet/',
      'http://printer.local/',
      'not a url',
    ]) {
      expect(normalizeOrigin(bad)).toBeNull();
    }
    expect(isFetchable(new URL('https://1.1.1.1/'))).toBe(true);
  });
});

describe('safeLookup — проверка адреса в момент соединения', () => {
  it('имя, которое резолвится в loopback, не пропускается (DNS-rebinding)', async () => {
    const { safeLookup } = await import('./favicon.service');
    const error = await new Promise<NodeJS.ErrnoException | null>((resolve) =>
      safeLookup('localhost', {}, (err) => resolve(err)),
    );
    expect(error?.code).toBe('EBLOCKED');
  });
});

describe('sniffImage — формат только по байтам', () => {
  it('PNG/ICO/GIF/JPEG/WebP — да; SVG и HTML — нет', () => {
    expect(sniffImage(PNG)).toBe('image/png');
    expect(sniffImage(ICO)).toBe('image/x-icon');
    expect(sniffImage(Buffer.from('GIF89a'))).toBe('image/gif');
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      'image/jpeg',
    );
    expect(sniffImage(Buffer.from('RIFF0000WEBPVP8 '))).toBe('image/webp');
    expect(sniffImage(SVG)).toBeNull();
    expect(sniffImage(HTML)).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });
});

describe('FaviconService', () => {
  it('берёт /favicon.ico origin, определяет формат по байтам и кэширует', async () => {
    const { svc, redis, calls } = service({
      'https://reallyworld.ru/favicon.ico': {
        status: 200,
        location: null,
        body: ICO,
      },
    });
    const icon = await svc.favicon('https://reallyworld.ru/news/1');
    expect(icon?.mime).toBe('image/x-icon');
    expect(calls).toEqual(['https://reallyworld.ru/favicon.ico']);
    expect(redis.store.get('favicon:v1:reallyworld.ru')).toContain(
      'image/x-icon',
    );
    // Второй раз — из кэша, без запроса.
    await svc.favicon('https://reallyworld.ru/');
    expect(calls).toHaveLength(1);
  });

  it('redirect на внутренний адрес не выполняется', async () => {
    const { svc, calls } = service({
      'https://evil.example/favicon.ico': {
        status: 302,
        location: 'http://169.254.169.254/latest/meta-data',
        body: null,
      },
    });
    expect(await svc.favicon('https://evil.example')).toBeNull();
    expect(calls).toEqual(['https://evil.example/favicon.ico']);
  });

  it('безопасный redirect — до 3 переходов, дальше — стоп', async () => {
    const { svc, calls } = service({
      'https://a.example/favicon.ico': {
        status: 301,
        location: 'https://b.example/i.ico',
        body: null,
      },
      'https://b.example/i.ico': { status: 200, location: null, body: PNG },
    });
    expect((await svc.favicon('https://a.example'))?.mime).toBe('image/png');
    expect(calls).toHaveLength(2);

    const loop = service({
      'https://loop.example/favicon.ico': {
        status: 302,
        location: 'https://loop.example/favicon.ico',
        body: null,
      },
    });
    expect(await loop.svc.favicon('https://loop.example')).toBeNull();
    expect(loop.calls).toHaveLength(4);
  });

  it('SVG/HTML вместо иконки и «нет иконки» — null, кэшируется как отсутствие', async () => {
    const { svc, redis } = service({
      'https://svg.example/favicon.ico': {
        status: 200,
        location: null,
        body: SVG,
      },
    });
    expect(await svc.favicon('https://svg.example')).toBeNull();
    expect(redis.store.get('favicon:v1:svg.example')).toBe('none');
    const missing = service({});
    expect(await missing.svc.favicon('https://none.example')).toBeNull();
  });

  it('слишком большой ответ отклоняется (лимит 64 КБ)', async () => {
    const { svc } = service({
      'https://big.example/favicon.ico': {
        status: 413,
        location: null,
        body: null,
      },
    });
    expect(await svc.favicon('https://big.example')).toBeNull();
    expect(FAVICON_MAX_BYTES).toBe(65536);
  });

  it('опасный адрес не делает ни одного запроса', async () => {
    const { svc, calls } = service({});
    for (const url of [
      'http://127.0.0.1',
      'http://localhost',
      'file:///etc/passwd',
      'http://10.1.2.3',
    ]) {
      expect(await svc.favicon(url)).toBeNull();
    }
    expect(calls).toHaveLength(0);
  });
});
