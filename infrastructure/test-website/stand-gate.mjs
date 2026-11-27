// Gate-сервис тестового стенда: форма входа вместо Basic Auth. Только node:*, без зависимостей.
// Работает за nginx (nginx.stand.conf.template): auth_request -> GET /__stand/auth; форма -> /__stand/login.
// Секреты читаются из файлов (пути из окружения) и не печатаются:
//   GATE_KEY_FILE        ключ HMAC для подписи cookie ($STAND_ROOT/gate.key, 600)
//   GATE_PASS_HASH_FILE  хеш пароля формата scrypt$N$r$p$соль_b64$хеш_b64 ($STAND_ROOT/gate.pass.hash, 600); читается при каждой попытке входа
//   GATE_TOKEN_FILE      сервисный токен для заголовка X-Stand-Gate ($STAND_ROOT/gate.service.token, 600; раннер, мониторинг); необязателен
// Прочее: GATE_PORT (4100), GATE_HOST (0.0.0.0 внутри контейнера; порт публикуется только на 127.0.0.1), GATE_COOKIE_DAYS (7).
// CLI: `node stand-gate.mjs hash` читает пароль со stdin и печатает строку хеша (пароль не попадает в argv).
import { createServer } from 'node:http';
import { createHmac, createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const COOKIE_NAME = '__Host-stand_gate';
export const LOGIN_PATH = '/__stand/login';
const SIGN_PREFIX = 'stand-gate-v1:';
const MAX_BODY = 4096;
const scryptAsync = (password, salt, keylen, opts) =>
  new Promise((resolve, reject) => scrypt(password, salt, keylen, opts, (e, k) => (e ? reject(e) : resolve(k))));
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

// ---- пароль
export function hashPassword(password, salt = randomBytes(16)) {
  const h = scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${h.toString('base64')}`;
}

// Асинхронно (libuv-пул): проверка пароля не блокирует цикл событий, /__stand/auth отвечает во время подбора.
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.trim().split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (![N, r, p].every(Number.isInteger) || N < 2 || N > 1 << 20 || r < 1 || r > 32 || p < 1 || p > 8) return false;
  const salt = Buffer.from(parts[4], 'base64');
  const want = Buffer.from(parts[5], 'base64');
  if (want.length < 16 || salt.length < 8) return false;
  let got;
  try {
    got = await scryptAsync(password, salt, want.length, { N, r, p, maxmem: 128 * N * r + 1024 * 1024 });
  } catch {
    return false;
  }
  return got.length === want.length && timingSafeEqual(got, want);
}

// ---- постоянное по времени сравнение строк (через sha256, чтобы длины совпали)
export function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

// ---- cookie: <expiry unix sec>.<hmac-sha256 hex>
export function signCookie(key, expiresAtSec) {
  const mac = createHmac('sha256', key).update(SIGN_PREFIX + expiresAtSec).digest('hex');
  return `${expiresAtSec}.${mac}`;
}

export function verifyCookie(key, value, nowSec) {
  if (typeof value !== 'string' || !/^\d{1,12}\.[0-9a-f]{64}$/.test(value)) return false;
  const [exp] = value.split('.');
  const expected = signCookie(key, Number(exp));
  if (!safeEqual(expected, value)) return false;
  return Number(exp) > nowSec;
}

// Имя с границей: «xx__Host-stand_gate=...» и «__Host-stand_gate_2=...» чужими cookie считаются (граница: начало строки или «;»).
export function readCookie(header, name) {
  if (typeof header !== 'string') return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`);
  const m = re.exec(header);
  return m ? m[1].trim() : null;
}

// Ключ лимита попыток: IPv4 как есть, IPv6 по префиксу /64 (иначе подбор с одной сети /64 обходит лимит), ::ffff:a.b.c.d -> IPv4.
export function limiterKey(ip) {
  const s = String(ip ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (mapped) return mapped[1];
  if (!s.includes(':')) return s || 'unknown';
  if (!/^[0-9a-f:.]+$/.test(s) || s.includes(':::') || (s.match(/::/g) ?? []).length > 1) return s;
  const [head, tail] = s.includes('::') ? s.split('::') : [s, null];
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = tail === null ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return s;
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

// ---- защита от open redirect: только относительный путь вида /x (один «/» в начале)
export function safeNext(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return '/';
  if (raw[0] !== '/' || raw[1] === '/' || raw[1] === '\\') return '/';
  if (/[\\\x00-\x1f\x7f]/.test(raw)) return '/';
  if (/%(5c|0d|0a|00)/i.test(raw)) return '/';
  if (/^\/__stand(\/|$|\?)/.test(raw)) return '/';
  try {
    const u = new URL(raw, 'https://gate.invalid');
    if (u.origin !== 'https://gate.invalid') return '/';
  } catch {
    return '/';
  }
  return raw;
}

// ---- пути мимо формы (решает gate, а не nginx: список под тестами). Только точные канонические пути, без %-кодов.
// Здесь пути как их видит браузер (до среза /api). Методы ограничены.
const BYPASS = [
  { re: /^\/api\/health$/, methods: ['GET', 'HEAD'] },
  { re: /^\/api\/webhooks\/payments\/[A-Za-z0-9_-]{1,64}$/, methods: ['POST'] },
  // Вебхук голосования (/api/voting/webhook/<slug>) сюда НЕ входит: в приложении нет подписи, метки времени и защиты от повтора.
  // Приём Bridge (плагины игровых серверов): подпись проверяет приложение (bridge-signature.guard). Ровно четыре маршрута.
  { re: /^\/api\/bridge\/v1\/handshake$/, methods: ['GET'] },
  { re: /^\/api\/bridge\/v1\/events$/, methods: ['POST'] },
  { re: /^\/api\/bridge\/v1\/delivery\/claim$/, methods: ['POST'] },
  { re: /^\/api\/bridge\/v1\/delivery\/ack$/, methods: ['POST'] },
];

export function isBypass(originalUri, method) {
  if (typeof originalUri !== 'string') return false;
  const path = originalUri.split('?')[0];
  const m = String(method || '').toUpperCase();
  return BYPASS.some((b) => b.re.test(path) && b.methods.includes(m));
}

// ---- лимит попыток по IP (в памяти)
export function createLimiter({ max = 10, windowMs = 60_000, now = () => Date.now(), maxKeys = 5000 } = {}) {
  const hits = new Map();
  return {
    hit(ip) {
      const t = now();
      if (hits.size > maxKeys) {
        for (const [k, v] of hits) if (v.every((x) => t - x >= windowMs)) hits.delete(k);
        if (hits.size > maxKeys) hits.clear();
      }
      const arr = (hits.get(ip) ?? []).filter((x) => t - x < windowMs);
      if (arr.length >= max) {
        hits.set(ip, arr);
        return false;
      }
      arr.push(t);
      hits.set(ip, arr);
      return true;
    },
  };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function renderLogin({ next = '/', error = '' } = {}) {
  const err = error
    ? `<p id="err" class="err" role="alert">${esc(error)}</p>`
    : '';
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Вход на стенд</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;background:#121212;color:#f2f2f2;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{width:100%;max-width:380px;background:#1c1c1c;border:1px solid #333;border-radius:12px;padding:24px}
h1{margin:0 0 4px;font-size:22px}
.sub{margin:0 0 20px;color:#b5b5b5;font-size:14px}
label{display:block;margin-bottom:6px;font-weight:600}
input[type=password]{width:100%;min-height:44px;padding:10px 12px;border-radius:8px;border:1px solid #555;background:#121212;color:#f2f2f2;font:inherit}
input[type=password][aria-invalid=true]{border-color:#ff7a7a}
input:focus-visible,button:focus-visible{outline:3px solid #ffb27d;outline-offset:2px}
.err{margin:8px 0 0;color:#ff9b9b;font-size:14px}
button{margin-top:16px;width:100%;min-height:44px;border:0;border-radius:8px;background:#F26A1B;color:#1a0d02;font:inherit;font-weight:700;cursor:pointer}
button:hover{background:#ff7d33}
</style>
</head>
<body>
<main>
<h1>Вход на стенд</h1>
<p class="sub">Тестовый стенд закрыт. Введите пароль доступа.</p>
<form method="post" action="${LOGIN_PATH}" autocomplete="off">
<input type="hidden" name="next" value="${esc(next)}">
<label for="pw">Пароль</label>
<input id="pw" name="password" type="password" required autofocus autocomplete="current-password"${error ? ' aria-invalid="true" aria-describedby="err"' : ''}>
${err}
<button type="submit">Войти</button>
</form>
</main>
</body>
</html>
`;
}

export function renderLogout() {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Выход со стенда</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;background:#121212;color:#f2f2f2;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{width:100%;max-width:380px;background:#1c1c1c;border:1px solid #333;border-radius:12px;padding:24px}
h1{margin:0 0 16px;font-size:22px}
button{width:100%;min-height:44px;border:0;border-radius:8px;background:#F26A1B;color:#1a0d02;font:inherit;font-weight:700;cursor:pointer}
button:focus-visible{outline:3px solid #ffb27d;outline-offset:2px}
</style>
</head>
<body>
<main>
<h1>Выйти со стенда?</h1>
<form method="post" action="/__stand/logout">
<button type="submit" autofocus>Выйти</button>
</form>
</main>
</body>
</html>
`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('too_large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// deps: { key, getPassHash(), serviceToken?, now?(ms), cookieDays?, limiter?, failDelayMs?, sleep?, log? }
export function createHandler(deps) {
  const now = deps.now ?? (() => Date.now());
  const cookieDays = deps.cookieDays ?? 7;
  const limiter = deps.limiter ?? createLimiter({ now });
  const failDelayMs = deps.failDelayMs ?? 700;
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log = deps.log ?? (() => {});
  const maxAge = cookieDays * 86400;

  const send = (res, code, body = '', headers = {}) => {
    res.writeHead(code, { 'cache-control': 'no-store', ...headers });
    res.end(body);
  };
  const html = (res, code, body) =>
    send(res, code, body, {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'",
    });
  const setCookie = (value, age) =>
    `${COOKIE_NAME}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
  const hasValidCookie = (req) => verifyCookie(deps.key, readCookie(req.headers.cookie, COOKIE_NAME), Math.floor(now() / 1000));
  const hasServiceToken = (req) => {
    const h = req.headers['x-stand-gate'];
    return Boolean(deps.serviceToken) && typeof h === 'string' && h.length > 0 && safeEqual(h, deps.serviceToken);
  };
  const clientIp = (req) => String(req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown').slice(0, 64);
  const loginRedirect = (res, uri) => send(res, 302, '', { location: `${LOGIN_PATH}?next=${encodeURIComponent(safeNext(uri))}` });

  function originOk(req) {
    const host = req.headers.host;
    const origin = req.headers.origin;
    if (!host || typeof origin !== 'string') return false;
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://gate.local');
    const path = url.pathname;
    try {
      if (path === '/__stand/auth') {
        if (req.headers['x-stand-internal'] === '1') return send(res, 204);
        if (isBypass(req.headers['x-original-uri'], req.headers['x-original-method'])) return send(res, 204);
        if (hasServiceToken(req) || hasValidCookie(req)) return send(res, 204);
        return send(res, 401);
      }

      if (path === '/__stand/redirect') {
        return loginRedirect(res, req.headers['x-original-uri']);
      }

      if (path === LOGIN_PATH && (req.method === 'GET' || req.method === 'HEAD')) {
        const next = safeNext(url.searchParams.get('next'));
        if (hasValidCookie(req)) return send(res, 302, '', { location: next });
        return html(res, 200, renderLogin({ next }));
      }

      if (path === LOGIN_PATH && req.method === 'POST') {
        const ip = clientIp(req);
        if (!originOk(req)) return send(res, 403, 'Forbidden', { 'content-type': 'text/plain; charset=utf-8' });
        if (!limiter.hit(limiterKey(ip))) {
          log(`login limited ip=${ip}`);
          return html(res, 429, renderLogin({ error: 'Слишком много попыток. Подождите минуту.' }));
        }
        let form;
        try {
          form = new URLSearchParams(await readBody(req));
        } catch {
          return send(res, 413, 'Too large', { 'content-type': 'text/plain; charset=utf-8' });
        }
        const next = safeNext(form.get('next'));
        const password = form.get('password') ?? '';
        let stored = '';
        try {
          stored = deps.getPassHash();
        } catch {
          stored = '';
        }
        if (password.length > 0 && password.length <= 256 && (await verifyPassword(password, stored))) {
          log(`login ok ip=${ip}`);
          const exp = Math.floor(now() / 1000) + maxAge;
          return send(res, 303, '', { location: next, 'set-cookie': setCookie(signCookie(deps.key, exp), maxAge) });
        }
        log(`login fail ip=${ip}`);
        await sleep(failDelayMs);
        return html(res, 401, renderLogin({ next, error: 'Неверный пароль.' }));
      }

      // GET (ссылка, картинка, предзагрузка) cookie не трогает: только страница с кнопкой. Выход - POST с проверкой Origin (CSRF).
      if (path === '/__stand/logout' && (req.method === 'GET' || req.method === 'HEAD')) {
        return html(res, 200, renderLogout());
      }
      if (path === '/__stand/logout' && req.method === 'POST') {
        if (!originOk(req)) return send(res, 403, 'Forbidden', { 'content-type': 'text/plain; charset=utf-8' });
        return send(res, 303, '', { location: LOGIN_PATH, 'set-cookie': setCookie('', 0) });
      }

      return send(res, 404, 'Not found', { 'content-type': 'text/plain; charset=utf-8' });
    } catch (e) {
      log(`error ${e && e.message ? e.message : 'unknown'}`);
      return send(res, 500, 'Error', { 'content-type': 'text/plain; charset=utf-8' });
    }
  };
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

async function main() {
  if (process.argv[2] === 'hash') {
    const pw = (await readStdin()).replace(/\r?\n$/, '');
    if (!pw) {
      console.error('Пустой пароль');
      process.exit(2);
    }
    process.stdout.write(hashPassword(pw) + '\n');
    return;
  }
  const keyFile = process.env.GATE_KEY_FILE;
  const hashFile = process.env.GATE_PASS_HASH_FILE;
  if (!keyFile || !hashFile) {
    console.error('Нужны GATE_KEY_FILE и GATE_PASS_HASH_FILE');
    process.exit(2);
  }
  const key = readFileSync(keyFile, 'utf8').trim();
  if (key.length < 32) {
    console.error('gate.key слишком короткий');
    process.exit(2);
  }
  let serviceToken = '';
  if (process.env.GATE_TOKEN_FILE) {
    try {
      serviceToken = readFileSync(process.env.GATE_TOKEN_FILE, 'utf8').trim();
    } catch {
      serviceToken = '';
    }
  }
  const handler = createHandler({
    key,
    serviceToken,
    getPassHash: () => readFileSync(hashFile, 'utf8').trim(),
    cookieDays: Number(process.env.GATE_COOKIE_DAYS || 7),
    log: (m) => console.log(`${new Date().toISOString()} ${m}`),
  });
  const port = Number(process.env.GATE_PORT || 4100);
  const host = process.env.GATE_HOST || '0.0.0.0';
  createServer(handler).listen(port, host, () => console.log(`stand-gate слушает ${host}:${port}`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e && e.message ? e.message : 'ошибка');
    process.exit(1);
  });
}
