// node --test infrastructure/test-website/stand-gate.test.mjs   (без зависимостей)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import {
  COOKIE_NAME, createHandler, createLimiter, hashPassword, isBypass, limiterKey, readCookie, safeNext, signCookie, verifyCookie, verifyPassword,
} from './stand-gate.mjs';

const KEY = 'k'.repeat(64);
const PASS = ['unit', 'test', 'pass', String(12345)].join('-'); // не боевой пароль
const TOKEN = 't'.repeat(48);
const HASH = hashPassword(PASS, Buffer.alloc(16, 7));

async function start(over = {}) {
  const clock = { t: 1_800_000_000_000 };
  const handler = createHandler({
    key: KEY, serviceToken: TOKEN, getPassHash: () => HASH, now: () => clock.t, failDelayMs: 0, sleep: async () => {}, ...over,
  });
  const server = createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, init = {}) => {
    const headers = { ...(init.headers ?? {}) };
    if (headers.origin === 'SELF') headers.origin = base; // fetch не даёт задать Host: Origin сверяется с реальным Host
    return fetch(base + path, { redirect: 'manual', ...init, headers });
  };
  return { clock, call, close: () => new Promise((r) => server.close(r)) };
}
const form = (o) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'SELF', 'x-real-ip': '10.0.0.1' },
  body: new URLSearchParams(o).toString(),
});

test('подпись cookie и истечение (подмена времени)', () => {
  const exp = 2_000_000;
  const v = signCookie(KEY, exp);
  assert.equal(verifyCookie(KEY, v, exp - 1), true);
  assert.equal(verifyCookie(KEY, v, exp), false);
  assert.equal(verifyCookie(KEY, v, exp + 100), false);
  assert.equal(verifyCookie('x'.repeat(64), v, exp - 1), false);
  assert.equal(verifyCookie(KEY, `${exp + 999}.${v.split('.')[1]}`, exp - 1), false); // подмена срока
  assert.equal(verifyCookie(KEY, 'garbage', 0), false);
  assert.equal(readCookie(`a=1; ${COOKIE_NAME}=${v}; b=2`, COOKIE_NAME), v);
  // L5: граница имени. Чужие cookie с похожим именем не принимаются.
  assert.equal(readCookie(`x${COOKIE_NAME}=${v}`, COOKIE_NAME), null);
  assert.equal(readCookie(`a=1;x${COOKIE_NAME}=${v}`, COOKIE_NAME), null);
  assert.equal(readCookie(`${COOKIE_NAME}_2=${v}`, COOKIE_NAME), null);
  assert.equal(readCookie(`a=1;${COOKIE_NAME}=${v}`, COOKIE_NAME), v);
  assert.equal(readCookie(`${COOKIE_NAME}=${v}`, COOKIE_NAME), v);
});

test('пароль (async scrypt): верный/неверный/мусорный хеш', async () => {
  assert.equal(await verifyPassword(PASS, HASH), true);
  assert.equal(await verifyPassword(PASS + 'x', HASH), false);
  assert.equal(await verifyPassword(PASS, 'scrypt$bad'), false);
  assert.equal(await verifyPassword(PASS, ''), false);
  assert.ok(verifyPassword(PASS, HASH) instanceof Promise); // не блокирует цикл событий
});

test('ключ лимита: IPv6 по /64, IPv4 как есть, mapped -> IPv4', () => {
  assert.equal(limiterKey('203.0.113.7'), '203.0.113.7');
  assert.equal(limiterKey('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(limiterKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
  assert.equal(limiterKey('2001:DB8:1:2::1'), '2001:db8:1:2::/64');
  assert.equal(limiterKey('2001:db8:1:2:ffff::9'), limiterKey('2001:db8:1:2::1'));
  assert.notEqual(limiterKey('2001:db8:1:3::1'), limiterKey('2001:db8:1:2::1'));
  assert.equal(limiterKey('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(limiterKey(''), 'unknown');
});

test('open redirect: безопасный next', () => {
  assert.equal(safeNext('/shop?a=1'), '/shop?a=1');
  for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', '\\\\evil.com', 'javascript:alert(1)', '', 'evil', '/a\\b', '/a%5Cb', '/\t/evil.com', '/a\nb', '/__stand/login?next=/', null, undefined, 42]) {
    assert.equal(safeNext(bad), '/', `должен отклоняться: ${JSON.stringify(bad)}`);
  }
});

test('bypass: только точные пути и методы', () => {
  assert.equal(isBypass('/api/health', 'GET'), true);
  assert.equal(isBypass('/api/health?x=1', 'GET'), true);
  assert.equal(isBypass('/api/health', 'POST'), false);
  assert.equal(isBypass('/api/webhooks/payments/test', 'POST'), true);
  assert.equal(isBypass('/api/webhooks/payments/test', 'GET'), false);
  // Вебхук голосования (нет подписи, метки времени, защиты от повтора) мимо формы не пропускается.
  for (const m of ['POST', 'GET', 'HEAD']) assert.equal(isBypass('/api/voting/webhook/topg', m), false, m);
  assert.equal(isBypass('/api/health/../auth/me', 'GET'), false);
  assert.equal(isBypass('/api/%68ealth', 'GET'), false);
  assert.equal(isBypass('/api/webhooks/payments/a/b', 'POST'), false);
  assert.equal(isBypass('/api/auth/me', 'GET'), false);
});

test('bypass Bridge: ровно 4 маршрута и методы, вариации -> gate', () => {
  assert.equal(isBypass('/api/bridge/v1/handshake', 'GET'), true);
  assert.equal(isBypass('/api/bridge/v1/handshake?a=1', 'GET'), true);
  assert.equal(isBypass('/api/bridge/v1/events', 'POST'), true);
  assert.equal(isBypass('/api/bridge/v1/events?x=1', 'POST'), true);
  assert.equal(isBypass('/api/bridge/v1/delivery/claim', 'POST'), true);
  assert.equal(isBypass('/api/bridge/v1/delivery/ack', 'POST'), true);
  for (const [p, m] of [
    ['/api/bridge/v1/handshake', 'POST'], ['/api/bridge/v1/handshake', 'HEAD'],['/api/bridge/v1/events', 'GET'], ['/api/bridge/v1/events', 'PUT'],
    ['/api/bridge/v1/events', 'DELETE'], ['/api/bridge/v1/delivery/claim', 'GET'], ['/api/bridge/v1/delivery/ack', 'GET'],
    ['/api/bridge/v1/other', 'GET'], ['/api/bridge/v1/other', 'POST'], ['/api/bridge/v1/', 'GET'], ['/api/bridge/v1', 'GET'],
    ['/api/bridge/v1/events/', 'POST'], ['/api/bridge/v1/events/x', 'POST'], ['/api/bridge/v1/delivery', 'POST'],
    ['/api/bridge/v1/../auth/me', 'GET'], ['/api/bridge/v1/events/..', 'POST'], ['/api/bridge/v1/%65vents', 'POST'],
    ['/api/bridge/v1/%2e%2e/auth/me', 'GET'], ['/api/bridge/v1/events%2f', 'POST'], ['/api/bridge//v1/events', 'POST'],
    ['/api//bridge/v1/events', 'POST'], ['//api/bridge/v1/events', 'POST'], ['/api/Bridge/v1/events', 'POST'],
    ['/api/bridge/V1/events', 'POST'], ['/api/bridge/v1/EVENTS', 'POST'], ['/api/bridge/v1/delivery/Claim', 'POST'],
    ['/api/bridge/v1/events;x', 'POST'], ['/api/bridge/v1/events\n', 'POST'],
    ['/api/bridge/v1/delivery/claim/ack', 'POST'], ['/x/api/bridge/v1/events', 'POST'],
    // вариации обхода: слеш в конце, «;», %3f (не «?»), HEAD/PUT/DELETE на POST-маршрутах, методы handshake
    ['/api/bridge/v1/events/', 'POST'], ['/api/bridge/v1/events/?x=1', 'POST'], ['/api/bridge/v1/handshake/', 'GET'],
    ['/api/bridge/v1/delivery/claim/', 'POST'], ['/api/bridge/v1/delivery/ack/', 'POST'],
    ['/api/bridge/v1/events;', 'POST'], ['/api/bridge/v1/events;a=b', 'POST'], ['/api/bridge/v1/delivery/claim;x', 'POST'],
    ['/api/bridge/v1/handshake;x', 'GET'], ['/api/bridge/v1/events%3f', 'POST'], ['/api/bridge/v1/events%3fx=1', 'POST'],
    ['/api/bridge/v1/events%3F', 'POST'], ['/api/bridge/v1/events', 'HEAD'], ['/api/bridge/v1/delivery/claim', 'HEAD'],
    ['/api/bridge/v1/delivery/ack', 'HEAD'], ['/api/bridge/v1/delivery/claim', 'PUT'], ['/api/bridge/v1/delivery/claim', 'DELETE'],
    ['/api/bridge/v1/delivery/ack', 'PUT'], ['/api/bridge/v1/delivery/ack', 'DELETE'], ['/api/bridge/v1/handshake', 'PUT'],
    ['/api/bridge/v1/handshake', 'DELETE'], ['/api/bridge/v1/events', 'PATCH'], ['/api/bridge/v1/events', 'OPTIONS'],
  ]) assert.equal(isBypass(p, m), false, `${m} ${JSON.stringify(p)}`);
  assert.equal(isBypass(undefined, 'POST'), false);
  assert.equal(isBypass('/api/bridge/v1/events', undefined), false);
});

test('auth: без cookie 401, с cookie 204, сервисный заголовок, неверный токен, истёкшая cookie', async () => {
  const s = await start();
  try {
    assert.equal((await s.call('/__stand/auth', { headers: { 'x-original-uri': '/', 'x-original-method': 'GET' } })).status, 401);
    const v = signCookie(KEY, Math.floor(s.clock.t / 1000) + 60);
    assert.equal((await s.call('/__stand/auth', { headers: { cookie: `${COOKIE_NAME}=${v}` } })).status, 204);
    assert.equal((await s.call('/__stand/auth', { headers: { 'x-stand-gate': TOKEN } })).status, 204);
    assert.equal((await s.call('/__stand/auth', { headers: { 'x-stand-gate': TOKEN + 'x' } })).status, 401);
    assert.equal((await s.call('/__stand/auth', { headers: { 'x-stand-gate': '' } })).status, 401);
    s.clock.t += 120_000;
    assert.equal((await s.call('/__stand/auth', { headers: { cookie: `${COOKIE_NAME}=${v}` } })).status, 401);
    assert.equal((await s.call('/__stand/auth', { headers: { 'x-original-uri': '/api/health', 'x-original-method': 'GET' } })).status, 204);
    assert.equal((await s.call('/__stand/auth', { headers: { 'x-stand-internal': '1' } })).status, 204);
  } finally { await s.close(); }
});

test('без настроенного сервисного токена пустой заголовок не пускает', async () => {
  const s = await start({ serviceToken: '' });
  try {
    assert.equal((await s.call('/__stand/auth', { headers: { 'x-stand-gate': '' } })).status, 401);
    assert.equal((await s.call('/__stand/auth', { headers: { 'x-stand-gate': 'anything' } })).status, 401);
  } finally { await s.close(); }
});

test('redirect: страница -> 302 на форму с безопасным next; open redirect схлопывается', async () => {
  const s = await start();
  try {
    let r = await s.call('/__stand/redirect', { headers: { 'x-original-uri': '/shop?a=1&b=2' } });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), `/__stand/login?next=${encodeURIComponent('/shop?a=1&b=2')}`);
    r = await s.call('/__stand/redirect', { headers: { 'x-original-uri': '//evil.com/x' } });
    assert.equal(r.headers.get('location'), `/__stand/login?next=${encodeURIComponent('/')}`);
  } finally { await s.close(); }
});

test('форма: lang=ru, noindex, label, без blur', async () => {
  const s = await start();
  try {
    const r = await s.call('/__stand/login?next=%2F%2Fevil.com');
    const html = await r.text();
    assert.equal(r.status, 200);
    assert.match(html, /<html lang="ru">/);
    assert.match(html, /<meta name="robots" content="noindex/);
    assert.match(html, /<label for="pw">/);
    assert.doesNotMatch(html, /blur|backdrop/i);
    assert.match(html, /name="next" value="\/"/);
  } finally { await s.close(); }
});

test('вход: неверный пароль 401 без cookie; верный 303 + cookie; Origin проверяется', async () => {
  const s = await start();
  try {
    let r = await s.call('/__stand/login', form({ password: 'wrong', next: '/' }));
    assert.equal(r.status, 401);
    assert.equal(r.headers.get('set-cookie'), null);
    assert.match(await r.text(), /aria-invalid="true"/);

    r = await s.call('/__stand/login', form({ password: PASS, next: '//evil.com' }));
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), '/');
    const sc = r.headers.get('set-cookie');
    assert.match(sc, /^__Host-stand_gate=\d+\.[0-9a-f]{64}; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=604800$/);
    assert.doesNotMatch(sc, /Domain=/i);
    const value = sc.split(';')[0].split('=')[1];
    assert.equal(verifyCookie(KEY, value, Math.floor(s.clock.t / 1000)), true);
    assert.equal(verifyCookie(KEY, value, Math.floor(s.clock.t / 1000) + 604801), false);

    r = await s.call('/__stand/login', form({ password: PASS, next: '/shop' }));
    assert.equal(r.headers.get('location'), '/shop');

    const evil = form({ password: PASS, next: '/' });
    evil.headers.origin = 'https://evil.example';
    assert.equal((await s.call('/__stand/login', evil)).status, 403);
    const noOrigin = form({ password: PASS, next: '/' });
    delete noOrigin.headers.origin;
    assert.equal((await s.call('/__stand/login', noOrigin)).status, 403);
  } finally { await s.close(); }
});

test('лимит попыток: 11-я за минуту -> 429, после окна снова можно', async () => {
  const limiter = createLimiter({ max: 10, windowMs: 60_000, now: () => clock.t });
  const clock = { t: 0 };
  const s = await start({ limiter });
  try {
    for (let i = 0; i < 10; i++) assert.equal((await s.call('/__stand/login', form({ password: 'bad', next: '/' }))).status, 401);
    assert.equal((await s.call('/__stand/login', form({ password: PASS, next: '/' }))).status, 429);
    clock.t += 61_000;
    assert.equal((await s.call('/__stand/login', form({ password: PASS, next: '/' }))).status, 303);
  } finally { await s.close(); }
});

test('лимит попыток: весь /64 IPv6 делит один счётчик', async () => {
  const limiter = createLimiter({ max: 3, windowMs: 60_000, now: () => 0 });
  const s = await start({ limiter });
  try {
    const f = (ip) => { const o = form({ password: 'bad', next: '/' }); o.headers['x-real-ip'] = ip; return o; };
    assert.equal((await s.call('/__stand/login', f('2001:db8:5:5::1'))).status, 401);
    assert.equal((await s.call('/__stand/login', f('2001:db8:5:5:1::2'))).status, 401);
    assert.equal((await s.call('/__stand/login', f('2001:db8:5:5:ffff:ffff:ffff:ffff'))).status, 401);
    assert.equal((await s.call('/__stand/login', f('2001:db8:5:5::99'))).status, 429);
    assert.equal((await s.call('/__stand/login', f('2001:db8:5:6::1'))).status, 401); // другая сеть /64
  } finally { await s.close(); }
});

test('выход (L3): GET - страница с кнопкой без смены cookie; POST с Origin очищает; чужой Origin 403', async () => {
  const s = await start();
  try {
    let r = await s.call('/__stand/logout');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('set-cookie'), null);
    const html = await r.text();
    assert.match(html, /<html lang="ru">/);
    assert.match(html, /<form method="post" action="\/__stand\/logout">/);
    assert.doesNotMatch(html, /blur|backdrop/i);
    r = await s.call('/__stand/logout', { method: 'POST', headers: { origin: 'SELF' } });
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), '/__stand/login');
    assert.match(r.headers.get('set-cookie'), /^__Host-stand_gate=; .*Max-Age=0$/);
    r = await s.call('/__stand/logout', { method: 'POST', headers: { origin: 'https://evil.example' } });
    assert.equal(r.status, 403);
    assert.equal(r.headers.get('set-cookie'), null);
    assert.equal((await s.call('/__stand/logout', { method: 'POST' })).status, 403); // без Origin
    assert.equal((await s.call('/unknown')).status, 404);
  } finally { await s.close(); }
});

test('L6: ни один ответ gate не просит Basic Auth (нет WWW-Authenticate)', async () => {
  const s = await start();
  try {
    const calls = [
      s.call('/__stand/auth', { headers: { 'x-original-uri': '/', 'x-original-method': 'GET' } }),
      s.call('/__stand/redirect', { headers: { 'x-original-uri': '/shop' } }),
      s.call('/__stand/login'),
      s.call('/__stand/login', form({ password: 'wrong', next: '/' })),
      s.call('/__stand/logout'),
      s.call('/unknown'),
    ];
    for (const r of await Promise.all(calls)) assert.equal(r.headers.get('www-authenticate'), null, `status ${r.status}`);
  } finally { await s.close(); }
});

test('L6: после выхода (cookie снята) повторный запрос -> 401 -> редирект на форму; HEAD/OPTIONS', async () => {
  const s = await start();
  try {
    let r = await s.call('/__stand/login', form({ password: PASS, next: '/' }));
    const cookie = r.headers.get('set-cookie').split(';')[0];
    const authed = { 'x-original-uri': '/shop', 'x-original-method': 'GET' };
    assert.equal((await s.call('/__stand/auth', { headers: { cookie, ...authed } })).status, 204);
    r = await s.call('/__stand/logout', { method: 'POST', headers: { origin: 'SELF', cookie } });
    assert.match(r.headers.get('set-cookie'), /Max-Age=0$/);
    // Браузер, получив Max-Age=0, cookie не шлёт: запрос без неё.
    assert.equal((await s.call('/__stand/auth', { headers: authed })).status, 401);
    r = await s.call('/__stand/redirect', { headers: { 'x-original-uri': '/shop' } });
    assert.equal(r.status, 302);
    assert.match(r.headers.get('location'), /^\/__stand\/login\?next=/);
    // Cookie без состояния: украденная копия действует до срока (сброс всех сессий = замена gate.key, runbook).
    assert.equal((await s.call('/__stand/auth', { headers: { cookie, ...authed } })).status, 204);
    // HEAD отдаёт форму без тела; OPTIONS и прочие методы на форму и выход -> 404.
    r = await s.call('/__stand/login', { method: 'HEAD' });
    assert.equal(r.status, 200);
    assert.equal(await r.text(), '');
    assert.equal((await s.call('/__stand/login', { method: 'OPTIONS' })).status, 404);
    assert.equal((await s.call('/__stand/login', { method: 'PUT' })).status, 404);
    assert.equal((await s.call('/__stand/logout', { method: 'OPTIONS' })).status, 404);
    // Обход по методам: HEAD/GET health можно, OPTIONS и POST health нельзя.
    assert.equal(isBypass('/api/health', 'HEAD'), true);
    assert.equal(isBypass('/api/health', 'OPTIONS'), false);
    assert.equal(isBypass('/api/webhooks/payments/test', 'OPTIONS'), false);
    assert.equal(isBypass('/api/webhooks/payments/test', 'HEAD'), false);
  } finally { await s.close(); }
});

// ---- Шаблон nginx (читается как текст): подделка заголовков снаружи, вырезание cookie пропуска, fallback картинок.
const TEMPLATE = readFileSync(new URL('./nginx.stand.conf.template', import.meta.url), 'utf8');
// Блок директивы: ищется в начале строки (не в комментариях); location - только внутри server{} с 443 (в блоке :80 свой `location /`).
function block(name) {
  const base = name.startsWith('location') ? TEMPLATE.indexOf('listen 443') : 0;
  const esc = name.trimEnd().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^\\s*${esc}\\s*\\{`, 'm').exec(TEMPLATE.slice(base));
  assert.ok(m, `нет блока ${name}`);
  const open = base + m.index + m[0].length - 1;
  let depth = 0;
  let i = open;
  for (; i < TEMPLATE.length; i++) {
    if (TEMPLATE[i] === '{') depth++;
    if (TEMPLATE[i] === '}' && --depth === 0) break;
  }
  return TEMPLATE.slice(open, i + 1);
}

test('шаблон: X-Stand-Internal задаёт только nginx из $stand_internal (geo по $remote_addr), клиентское значение затирается', () => {
  assert.match(block('location = /__stand/auth'), /proxy_set_header X-Stand-Internal \$stand_internal;/);
  assert.match(block('geo $stand_internal'), /127\.0\.0\.1\/32\s+1;/);
  assert.doesNotMatch(TEMPLATE.replace(/^\s*#.*$/gm, ''), /set_real_ip_from|real_ip_header|\$http_x_stand_internal|\$http_x_forwarded_for|\$http_x_real_ip/i, 'адрес клиента берётся только из $remote_addr');
  for (const loc of ['location /api/ ', 'location / ', 'location /api/uploads/ ']) {
    const b = block(loc);
    assert.match(b, /proxy_set_header X-Forwarded-For \$remote_addr;/, loc);
    assert.match(b, /proxy_set_header X-Stand-Gate "";/, loc);
    assert.doesNotMatch(b, /X-Stand-Internal/, loc);
  }
});

// Регулярные выражения map $http_cookie переносятся в JS как есть (PCRE и JS совпадают в этих конструкциях).
function stripGateCookie(header) {
  const m = block('map $http_cookie $stand_fwd_cookie');
  const rules = [...m.matchAll(/^\s*"~(.+?)"\s+"(.*)"\s*;/gm)].map((x) => [new RegExp(x[1]), x[2]]);
  assert.equal(rules.length, 3);
  for (const [re, out] of rules) {
    const r = re.exec(header);
    if (r) return out.replace(/\$(\w+)/g, (_, n) => r.groups?.[n] ?? '');
  }
  return header;
}

test('шаблон: cookie пропуска вырезается перед приложением, остальные cookie и чужие имена нетронуты', () => {
  const v = signCookie(KEY, 2_000_000);
  const g = `${COOKIE_NAME}=${v}`;
  assert.equal(stripGateCookie(g), '');
  assert.equal(stripGateCookie(`a=1; ${g}`), 'a=1');
  assert.equal(stripGateCookie(`${g}; b=2`), 'b=2');
  assert.equal(stripGateCookie(`a=1; ${g}; b=2; c=3`), 'a=1; b=2; c=3');
  assert.equal(stripGateCookie(`a=1;${g};b=2`), 'a=1;b=2');
  assert.equal(stripGateCookie('a=1; b=2'), 'a=1; b=2');
  assert.equal(stripGateCookie(`x${g}`), `x${g}`); // чужая cookie с похожим окончанием имени
  assert.equal(stripGateCookie(`a=1; two_factor_challenge=abc; ${g}`), 'a=1; two_factor_challenge=abc');
  assert.doesNotMatch(stripGateCookie(`a=1; ${g}; b=2`), /stand_gate/);
});

test('шаблон: fallback картинок на CDN - только чтение публичных файлов', () => {
  const up = block('location /api/uploads/ ');
  assert.match(up, /error_page 404 = @cdn_uploads;/);
  assert.match(up, /proxy_intercept_errors on;/);
  assert.match(up, /limit_except GET HEAD \{ deny all; \}/);
  assert.match(up, /auth_request \/__stand\/auth;/);
  const cdn = block('location @cdn_uploads');
  assert.match(cdn, /proxy_pass https:\/\/cdn-files\.twomc\.su\/\$stand_cdn_path;/);
  assert.match(cdn, /proxy_ssl_server_name on;/);
  assert.match(cdn, /proxy_set_header Host cdn-files\.twomc\.su;/);
  assert.match(cdn, /proxy_pass_request_body off;/);
  assert.match(cdn, /proxy_set_header Cookie "";/);
  assert.match(cdn, /proxy_set_header Authorization "";/);
  assert.doesNotMatch(cdn, /auth_request|proxy_method|proxy_pass http:/);
  // Отображение пути: только безопасные символы, без «..».
  const re = new RegExp(/"~(.+?)"/.exec(block('map $uri $stand_cdn_path'))[1]);
  assert.equal(re.exec('/api/uploads/assets/images/logo.png').groups.cdn_rest, 'assets/images/logo.png');
  assert.equal(re.exec('/api/uploads/avatars/u1/a-b_c.webp').groups.cdn_rest, 'avatars/u1/a-b_c.webp');
  for (const bad of ['/api/uploads/../etc/passwd', '/api/uploads/a/../b', '/api/uploads/a b', '/api/uploads/a%2e%2e/b', '/api/uploads/', '/api/uploads/a?x=1']) {
    assert.equal(re.exec(bad), null, bad);
  }
});

test('bypass Bridge в корне: ровно 4 маршрута и методы, вариации -> gate', () => {
  assert.equal(isBypass('/bridge/v1/handshake', 'GET'), true);
  assert.equal(isBypass('/bridge/v1/handshake?a=1', 'get'), true);
  assert.equal(isBypass('/bridge/v1/events', 'POST'), true);
  assert.equal(isBypass('/bridge/v1/delivery/claim', 'POST'), true);
  assert.equal(isBypass('/bridge/v1/delivery/ack?x=1', 'POST'), true);
  for (const [p, m] of [
    ['/bridge/v1/handshake', 'POST'], ['/bridge/v1/handshake', 'HEAD'], ['/bridge/v1/handshake', 'PUT'],
    ['/bridge/v1/events', 'GET'], ['/bridge/v1/events', 'HEAD'], ['/bridge/v1/events', 'PUT'], ['/bridge/v1/events', 'DELETE'],
    ['/bridge/v1/events', 'PATCH'], ['/bridge/v1/events', 'OPTIONS'], ['/bridge/v1/delivery/claim', 'GET'],
    ['/bridge/v1/delivery/ack', 'GET'], ['/bridge/v1/delivery/ack', 'DELETE'],
    ['/bridge/v1/other', 'GET'], ['/bridge/v1/other', 'POST'], ['/bridge/v1/', 'GET'], ['/bridge/v1', 'GET'], ['/bridge', 'GET'],
    ['/bridge/v1/events/', 'POST'], ['/bridge/v1/events/x', 'POST'], ['/bridge/v1/handshake/', 'GET'], ['/bridge/v1/delivery', 'POST'],
    ['/bridge/v1/delivery/claim/', 'POST'], ['/bridge/v1/delivery/ack/', 'POST'], ['/bridge/v1/delivery/claim/ack', 'POST'],
    ['//bridge/v1/events', 'POST'], ['/bridge//v1/events', 'POST'], ['/bridge/v1//events', 'POST'], ['/bridge/v1/delivery//ack', 'POST'],
    ['/bridge/v1/%65vents', 'POST'], ['/bridge/v1/%2e%2e/auth/me', 'GET'], ['/bridge/v1/%2E/events', 'POST'], ['/bridge/v1/./events', 'POST'],
    ['/bridge/v1/../events', 'POST'], ['/bridge/v1/events%2f', 'POST'], ['/bridge/v1/events%3f', 'POST'], ['/bridge/v1/events%00', 'POST'],
    ['/Bridge/v1/events', 'POST'], ['/bridge/V1/events', 'POST'], ['/bridge/v1/Events', 'POST'], ['/bridge/v1/EVENTS', 'POST'],
    ['/bridge/v1/delivery/Claim', 'POST'], ['/bridge/v1/events;x', 'POST'], ['/bridge/v1/events;', 'POST'], ['/bridge/v1/handshake;a=b', 'GET'],
    ['/bridge/v1/events\n', 'POST'], ['/x/bridge/v1/events', 'POST'], ['/bridge/v1/events/..', 'POST'],
    ['/apibridge/v1/events', 'POST'], ['/bridge/v1/events.json', 'POST'],
  ]) assert.equal(isBypass(p, m), false, `${m} ${JSON.stringify(p)}`);
});
