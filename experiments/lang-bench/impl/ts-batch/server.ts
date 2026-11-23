// HTTP-обёртка (node:http, без фреймворка и зависимостей). Запуск: node server.ts (Node >= 22.18 / 24, type stripping).
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { calculate } from './calc.ts';
import { MemoryStore } from './store.ts';

const PORT = Number(process.env.PORT ?? 8080);
const DATASET_PATH = process.env.DATASET_PATH ?? fileURLToPath(new URL('../../fixtures/dataset.json', import.meta.url));
const LATENCY = Number(process.env.DB_LATENCY_MS ?? 0);
const MAX_BODY = 1024 * 1024;

const store = new MemoryStore(DATASET_PATH, LATENCY);

const server = createServer((req, res) => {
  const send = (status: number, body: unknown): void => {
    const text = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
    res.end(text);
  };
  if (req.method === 'GET' && req.url === '/health') return send(200, { status: 'ok' });
  if (req.method !== 'POST' || req.url !== '/store/cart/calculate') return send(404, { code: 'NOT_FOUND' });

  const chunks: Buffer[] = [];
  let size = 0;
  let aborted = false;
  req.on('data', (c: Buffer) => {
    size += c.length;
    if (size > MAX_BODY) {
      aborted = true;
      send(413, { code: 'PAYLOAD_TOO_LARGE' });
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', () => {
    if (aborted) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return send(400, { code: 'VALIDATION', message: 'JSON' });
    }
    calculate(parsed, store).then(
      (r) => send(r.status, r.body),
      () => send(500, { code: 'INTERNAL' }),
    );
  });
});
server.keepAliveTimeout = 65_000;
server.listen(PORT, '0.0.0.0', () => console.log(`ts-batch listening on ${PORT}`));
