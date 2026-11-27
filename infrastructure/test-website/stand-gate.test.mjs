// node --test infrastructure/test-website/stand-gate.test.mjs   (без зависимостей)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  COOKIE_NAME, createHandler, createLimiter, hashPassword, isBypass, readCookie, safeNext, signCookie, verifyCookie, verifyPassword,
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
});

test('пароль: верный/неверный/мусорный хеш', () => {
  assert.equal(verifyPassword(PASS, HASH), true);
  assert.equal(verifyPassword(PASS + 'x', HASH), false);
  assert.equal(verifyPassword(PASS, 'scrypt$bad'), false);
  assert.equal(verifyPassword(PASS, ''), false);
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
  assert.equal(isBypass('/api/voting/webhook/topg', 'POST'), true);
  assert.equal(isBypass('/api/health/../auth/me', 'GET'), false);
  assert.equal(isBypass('/api/%68ealth', 'GET'), false);
  assert.equal(isBypass('/api/webhooks/payments/a/b', 'POST'), false);
  assert.equal(isBypass('/api/auth/me', 'GET'), false);
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

test('выход очищает cookie; закрытые пути gate -> 404', async () => {
  const s = await start();
  try {
    const r = await s.call('/__stand/logout');
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), '/__stand/login');
    assert.match(r.headers.get('set-cookie'), /^__Host-stand_gate=; .*Max-Age=0$/);
    assert.equal((await s.call('/unknown')).status, 404);
  } finally { await s.close(); }
});
