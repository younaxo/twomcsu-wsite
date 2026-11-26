// Дымовая проверка стенда (НА СЕРВЕРЕ, через api-образ стенда; см. smoke.sh). Секреты читаются из смонтированных файлов
// и НЕ печатаются. Ходит напрямую на loopback-порты api/web (минуя nginx и basic auth). Это не браузерная проверка:
// веб-страницы проверяются кодом ответа и маркером в HTML, поведение UI - только через API.
//   node smoke.mjs   (ожидает /in/stand.env, /in/accounts; API_URL, WEB_URL из окружения)
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

// ---- маскирование секретов: ЛЮБОЙ вывод (console.*, необработанные ошибки) проходит через mask(). Значения паролей, ключей, токенов и TOTP-секрета
// регистрируются при чтении stand.env/accounts и при получении accessToken; дополнительно режутся JWT, Bearer, пароли в URL и otpauth://.
// Самопроверка без сети и файлов: SMOKE_SELFTEST_MASK=1 node smoke.mjs
const SECRET_VALUES = new Set();
const addSecret = (v) => {
  if (typeof v === 'string' && v.length >= 6) SECRET_VALUES.add(v);
};
const SECRET_KEY = /SECRET|PASSWORD|PASS|TOKEN|KEY|PEPPER|SALT|CREDENTIAL|DATABASE_URL|REDIS_URL|DSN/i;
const mask = (s) => {
  let t = String(s);
  for (const v of SECRET_VALUES) t = t.split(v).join('***');
  return t
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '***jwt***')
    .replace(/(Bearer\s+)\S+/gi, '$1***')
    .replace(/(Basic\s+)[A-Za-z0-9+/=]{4,}/gi, '$1***')
    .replace(/("(?:password|passwd|pass|pwd|secret|token|accessToken|refreshToken|totp|backupCode|backupCodes)"\s*:\s*")[^"]{4,}(")/gi, '$1***$2')
    .replace(/\b((?:password|passwd|pass|pwd|secret|token)\s*=\s*)[^\s&"',;]{4,}/gi, '$1***')
    .replace(/(:\/\/[^\s:@/]+:)[^\s@/]+@/g, '$1***@')
    .replace(/otpauth:\/\/\S+/gi, 'otpauth://***');
};
const show = (x) => (typeof x === 'string' ? x : x instanceof Error ? (x.stack ?? x.message) : JSON.stringify(x));
for (const m of ['log', 'info', 'warn', 'error']) {
  const orig = console[m].bind(console);
  console[m] = (...a) => orig(...a.map((x) => mask(show(x))));
}
process.on('uncaughtException', (e) => {
  console.error('НЕОБРАБОТАННАЯ ОШИБКА:', e?.message ?? e);
  process.exit(2);
});
process.on('unhandledRejection', (e) => {
  console.error('НЕОБРАБОТАННЫЙ ОТКАЗ:', e?.message ?? e);
  process.exit(2);
});
if (process.env.SMOKE_SELFTEST_MASK === '1') {
  const fake = ['fake-' + 'pw-value-1', 'fake-' + 'totp-value-2', 'fake-' + 'backup-value-3'];
  fake.forEach(addSecret);
  const probes = [
    `пароль ${fake[0]}`,
    `totp=${fake[1]} backup=${fake[2]}`,
    new Error(`boom ${fake[0]}`),
    'Authorization: Bearer abc.def.ghi',
    'jwt ' + ['eyJhbGci' + 'OiJIUzI1NiJ9', 'eyJzdWIi' + 'OiIxIn0', 'sig'].join('.'),
    'postgresql://user:' + 'hunter2'.repeat(2) + '@db:5432/x',
    'otpauth://totp/x?secret=' + 'JBSWY3DP' + 'EHPK3PXP',
    `{"password":"${'zz' + 'unknown-pw-1'}","login":"x"}`,
    `password=${'zz' + 'unknown-pw-2'}&x=1`,
    `Authorization: Basic ${'QUJD' + 'REVGR0g='}`,
  ];
  const leaked = probes
    .map((p) => mask(show(p)))
    .filter((o) => fake.some((f) => o.includes(f)) || /hunter2|eyJhbGci|abc\.def|secret=JBSW|unknown-pw|QUJDREVG/.test(o));
  console.log(leaked.length ? `mask-selftest: УТЕЧКА ${leaked.length}` : `mask-selftest: ok (${probes.length} проб)`);
  process.exit(leaked.length ? 1 : 0);
}

const API = process.env.API_URL || 'http://127.0.0.1:4000';
const WEB = process.env.WEB_URL || 'http://127.0.0.1:3000';
const read = (p) => readFileSync(p, 'utf8');
const env = Object.fromEntries(
  read('/in/stand.env')
    .split('\n')
    .filter((l) => /^[A-Z_0-9]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
// accounts: "player: <ник> <email> <пароль>", "admin: <ник> <email> <пароль> ...", "admin2fa: <TOTP-секрет> <резервные коды>".
const acc = {};
for (const l of read('/in/accounts').split('\n')) {
  const i = l.indexOf(':');
  if (i > 0 && !l.startsWith('Устарело')) acc[l.slice(0, i).trim()] = l.slice(i + 1).trim().split(/\s+/).map((t) => t.replace(/^[a-z_0-9]+=/i, ''));
}
for (const [k, v] of Object.entries(env)) if (SECRET_KEY.test(k)) addSecret(v);
for (const k of ['player', 'admin']) addSecret((acc[k] ?? [])[2]);
for (const t of acc.admin2fa ?? []) addSecret(t);
const results = [];
const rec = (name, ok, evidence) => {
  results.push({ name, ok });
  console.log(`${ok ? 'РАБОТАЕТ' : 'НЕТ     '} | ${name} | ${evidence}`);
};

function totp(secret) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', key).update(c).digest();
  const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

async function call(method, base, path, { token, body, cookie, raw } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  let payload;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = raw ?? JSON.stringify(body);
  }
  const res = await fetch(base + path, { method, headers, body: payload, redirect: 'manual' });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* не JSON */
  }
  if (json?.accessToken) addSecret(json.accessToken);
  return { status: res.status, json, text, res };
}
const api = (m, p, o) => call(m, API, p, o);
const web = (p) => call('GET', WEB, p);
const keys = (o) => (o && typeof o === 'object' ? Object.keys(o).slice(0, 8).join('|') : typeof o);
const arr = (j) => (Array.isArray(j) ? j : j?.items ?? j?.data ?? j?.products ?? j?.results ?? []);

// ---- публичные страницы и каталог
for (const [name, path] of [
  ['Главная /', '/'],
  ['Магазин /shop', '/shop'],
  ['Лидерборды /leaderboards', '/leaderboards'],
  ['Баны /bans', '/bans'],
]) {
  const r = await web(path);
  rec(name, r.status === 200, `web ${r.status}`);
}
const plist = await api('GET', '/store/products?limit=50');
const products = arr(plist.json);
rec('API каталог /store/products', plist.status === 200 && products.length > 0, `api ${plist.status}, товаров ${products.length}`);
const slug = products[0]?.slug;
const pd = slug ? await api('GET', `/store/products/${slug}`) : { status: 0, json: null };
const variants = pd.json?.variants ?? [];
const variantId = variants.find((v) => v.isActive !== false)?.id ?? variants[0]?.id;
rec('Страница товара (API+web)', pd.status === 200 && !!variantId && (await web(`/shop/${slug}`)).status === 200, `api ${pd.status}, вариантов ${variants.length}, web /shop/<slug> проверен`);

const pm = await api('GET', '/store/payment-methods');
const methods = pm.json?.methods ?? [];
rec('GET /store/payment-methods', pm.status === 200 && methods.length >= 3, `api ${pm.status}, способов ${methods.length}: ${methods.map((m) => m.method ?? m.code).join(',')}; поля ${keys(methods[0])}`);

// ---- вход
async function login(identity, password, secret) {
  const r = await api('POST', '/auth/login', { body: { emailOrUsername: identity, password } });
  if (r.json?.accessToken) return { token: r.json.accessToken, status: r.status, step: 'login' };
  if (r.json?.twoFactorRequired && secret) {
    const sc = r.res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const r2 = await api('POST', '/auth/login/2fa', { body: { code: totp(secret) }, cookie: sc });
    return { token: r2.json?.accessToken, status: r2.status, step: '2fa' };
  }
  return { token: null, status: r.status, step: 'login', twoFactorRequired: !!r.json?.twoFactorRequired, why: String(r.json?.code ?? r.json?.message ?? '').slice(0, 80) };
}
const pl = acc.player ?? [];
const player = await login(pl[0], pl[2]);
rec('Вход игрока', !!player.token, `${player.step} ${player.status} ${player.why ?? ''}`);
const ad = acc.admin ?? [];
const secret = (acc.admin2fa ?? [])[0];
let admin = await login('stand_owner', env.BOOTSTRAP_OWNER_PASSWORD, secret);
if (!admin.token) admin = await login(ad[0], ad[2], secret);
rec('Вход админа с 2FA (TOTP)', !!admin.token, `${admin.step} ${admin.status} ${admin.why ?? ''}`);

// ---- оформление и оплата
let orderNumber = null;
if (player.token && variantId) {
  const t = player.token;
  await api('DELETE', '/store/cart', { token: t });
  const add = await api('POST', '/store/cart/items', { token: t, body: { variantId, quantity: 1 } });
  const cart = await api('GET', '/store/cart', { token: t });
  rec('Корзина (добавить, прочитать)', add.status < 300 && cart.status === 200, `add ${add.status}, cart ${cart.status}${add.status >= 300 ? ' ' + keys(add.json) + ':' + String(add.json?.message ?? '').slice(0, 80) : ''}`);
  const bad = await api('POST', '/store/orders', { token: t, body: { paymentMethod: 'NO_SUCH' } });
  rec('Оформление: неверный способ оплаты отклоняется', bad.status === 400 || bad.status === 422, `api ${bad.status} ${String(bad.json?.code ?? bad.json?.message ?? '').slice(0, 60)}`);
  const cfg = await api('GET', '/store/checkout-config');
  const offerVersion = cfg.json?.offerVersion;
  const ord = await api('POST', '/store/orders', { token: t, body: { paymentMethod: methods[0]?.method ?? methods[0]?.code ?? 'SBP', offerVersion } });
  const o = ord.json?.order ?? ord.json;
  orderNumber = o?.orderNumber ?? null;
  rec('Оформление с выбором способа оплаты', ord.status < 300 && !!orderNumber, `api ${ord.status}, статус ${o?.status}, способ ${o?.paymentMethod ?? '?'}, провайдер ${o?.paymentProvider ?? '?'}${orderNumber ? '' : ' ' + keys(ord.json) + ':' + String(ord.json?.message ?? '').slice(0, 100)}`);
  if (orderNumber) {
    const total = String(o.total ?? o.totalAmount ?? o.payableAmount);
    const provider = o.paymentProvider ?? 'mock-ru';
    const prefix = { 'mock-ru': 'mockru' }[provider] ?? provider.replace(/-/g, '');
    const rawBody = JSON.stringify({ orderNumber, paymentId: `${prefix}_${orderNumber}`, status: 'succeeded', amount: total, currency: 'RUB' });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET).update(`${ts}.`).update(rawBody).digest('hex');
    const res = await fetch(`${API}/webhooks/payments/${provider}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-twomc-timestamp': ts, 'x-twomc-signature': sig },
      body: rawBody,
    });
    const whText = await res.text();
    rec('Вебхук оплаты (подписанный)', res.status === 200, `api ${res.status} ${whText.slice(0, 60)}`);
    const after = await api('GET', `/store/orders/${orderNumber}`, { token: t });
    const a = after.json?.order ?? after.json;
    rec('Заказ -> COMPLETED', a?.status === 'COMPLETED', `api ${after.status}, статус ${a?.status}, способ оплаты ${a?.paymentMethod ?? '?'}`);
    const mine = await api('GET', '/store/orders', { token: t });
    const row = arr(mine.json).find((x) => x.orderNumber === orderNumber);
    rec('«Мои заказы»: способ оплаты виден', mine.status === 200 && !!row && !!(row.paymentMethod ?? row.paymentMethodTitle), `api ${mine.status}, способ ${row?.paymentMethod ?? row?.paymentMethodTitle ?? 'нет'}`);
  }
}
for (const [name, path] of [
  ['Страница корзины /shop/cart', '/shop/cart'],
  ['Страница оформления /shop/checkout', '/shop/checkout'],
  ['Страница «Мои заказы» /shop/orders', '/shop/orders'],
  ['Страница «Мои наказания» /settings/punishments', '/settings/punishments'],
  ['Профиль /u/stand_player2', '/u/stand_player2'],
  ['/settings/inventory', '/settings/inventory'],
]) {
  const r = await web(path);
  rec(name + ' (web, без сессии)', r.status === 200 || r.status === 307 || r.status === 302, `web ${r.status}${r.status >= 300 && r.status < 400 ? ' -> ' + r.res.headers.get('location') : ''}`);
}

// ---- флаги и публичные разделы
if (admin.token) {
  const flags = await api('PATCH', '/admin/settings', {
    token: admin.token,
    body: { settings: { 'stats.public.enabled': 'true', 'punishments.public.enabled': 'true' } },
  });
  rec('Админ: включены stats.public.enabled и punishments.public.enabled', flags.status < 300, `api ${flags.status}`);
}
{
  const lb = await api('GET', '/leaderboards');
  rec('API /leaderboards', lb.status === 200, `api ${lb.status}, поля ${keys(lb.json)}`);
  const bp = await api('GET', '/punishments/public');
  const items = arr(bp.json);
  rec('API /punishments/public (/bans)', bp.status === 200, `api ${bp.status}, записей ${items.length}`);
  const bw = await web('/bans');
  rec('Web /bans после включения', bw.status === 200, `web ${bw.status}`);
  const lw = await web('/leaderboards');
  rec('Web /leaderboards после включения', lw.status === 200, `web ${lw.status}`);
}
if (player.token) {
  const mp = await api('GET', '/punishments/me', { token: player.token });
  rec('«Мои наказания» /punishments/me', mp.status === 200 || mp.status === 404, `api ${mp.status}, поля ${keys(mp.json)}`);
  const inv = await api('GET', '/inventory/me', { token: player.token });
  // BRIDGE_ENABLED на стенде выключен намеренно (fail-closed, ADR-0168): 503 inventory_unavailable - ожидаемое поведение, не поломка.
  rec('Инвентарь /inventory/me', inv.status === 200 || (inv.status === 503 && inv.json?.code === 'inventory_unavailable'), `api ${inv.status}${inv.status === 503 ? ' inventory_unavailable (мост выключен, ожидаемо)' : ', поля ' + keys(inv.json)}`);
  const prof = await api('GET', '/auth/me', { token: player.token });
  rec('Профиль /auth/me', prof.status === 200, `api ${prof.status}`);
}

// ---- админка
if (admin.token) {
  for (const [name, path] of [
    ['Админ: товары', '/admin/store/products'],
    ['Админ: заказы', '/admin/orders'],
    ['Админ: наборы', '/admin/store/bundles'],
    ['Админ: промокоды', '/admin/promocodes'],
    ['Админ: выдача /admin/store/delivery (API задач)', '/admin/delivery/tasks'],
  ]) {
    const r = await api('GET', path, { token: admin.token });
    rec(name, r.status === 200, `api ${r.status}, ${Array.isArray(r.json) ? 'массив ' + r.json.length : 'поля ' + keys(r.json)}`);
  }
  for (const [name, path] of [
    ['Админ web: /admin/store/products', '/admin/store/products'],
    ['Админ web: /admin/store/orders', '/admin/store/orders'],
    ['Админ web: /admin/store/bundles', '/admin/store/bundles'],
    ['Админ web: /admin/store/promocodes', '/admin/store/promocodes'],
    ['Админ web: /admin/store/delivery', '/admin/store/delivery'],
  ]) {
    const r = await web(path);
    rec(name + ' (без сессии)', r.status === 200 || r.status === 307 || r.status === 302, `web ${r.status}`);
  }
  const noadm = await api('GET', '/admin/orders');
  rec('Админ API без токена закрыт', noadm.status === 401, `api ${noadm.status}`);
}
const bad = results.filter((r) => !r.ok).length;
console.log(`ИТОГО: ${results.length - bad}/${results.length} работает, ${bad} нет`);
process.exit(bad ? 1 : 0);
