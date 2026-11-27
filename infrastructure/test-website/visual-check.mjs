// Визуальная проверка стенда в браузере (НА СЕРВЕРЕ, одноразовый контейнер Playwright; см. visual-check.sh).
// Для каждой пары страница x ширина: HTTP-статус, горизонтальный скролл, интерактивные элементы < 40x40 на мобильных,
// ошибки консоли, скриншот. Секреты читаются из смонтированного файла учёток и НЕ печатаются (весь вывод проходит через mask()).
// Вход: игрок и админ с TOTP через форму /login, как при проверке 2FA. Один контекст на роль (refresh-токен ротируется),
// ширина меняется setViewportSize.
//   node visual-check.mjs   (ожидает /in/accounts; BASE_URL, API_URL, OUT_DIR, WIDTHS из окружения; playwright-core в NODE_PATH-каталоге PW_DIR)
//   SMOKE_SELFTEST_MASK=1 node visual-check.mjs   - самопроверка маскирования без сети и браузера
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';

// Маска секретов - общий модуль mask.mjs (рядом с этим файлом; тот же, что у smoke.mjs). addSecret регистрирует значения от 4 символов.
import { addSecret, mask, installMask, runMaskSelftest } from './mask.mjs';
installMask();
if (process.env.SMOKE_SELFTEST_MASK === '1') process.exit(runMaskSelftest());

// BASE_URL приходит только из конфигурации (visual-check.sh); здесь повторная проверка: https, только origin
const BASE = (process.env.BASE_URL || 'https://test-website.twomc.su').replace(/\/$/, '');
if (!/^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/.test(BASE)) {
  console.error('BASE_URL должен быть https://хост[:порт] без пути');
  process.exit(2);
}
const API = process.env.API_URL || 'http://127.0.0.1:4000';
const OUT = process.env.OUT_DIR || '/out';
const WIDTHS = (process.env.WIDTHS || '360,390,1280').split(',').map(Number);
const PW_DIR = process.env.PW_DIR || '/tmp/pw';
const { chromium } = createRequire(PW_DIR + '/')('playwright-core');

// Формат файла учёток: секции формы входа на стенд (в файле у неё историческое имя «basic auth»; ключ password) / [игрок] / [админ], строки "ключ: значение" (login, password, totp_secret).
const acc = {};
{
  let sec = '';
  for (const l of readFileSync('/in/accounts', 'utf8').replace(/\r/g, '').split('\n')) {
    const h = l.match(/^\s*\[(.+)\]\s*$/);
    if (h) {
      sec = h[1].trim().toLowerCase();
      acc[sec] = {};
      continue;
    }
    const kv = l.match(/^\s*([a-z_]+)\s*:\s*(\S.*)$/i);
    if (sec && kv) acc[sec][kv[1].toLowerCase()] = kv[2].trim();
  }
}
const basic = acc['basic auth'] ?? {};
const player = acc['игрок'] ?? {};
const admin = acc['админ'] ?? {};
// логины не секрет (нужны в путях); маскируются пароли и TOTP-секрет
for (const o of [basic, player, admin]) for (const [k, v] of Object.entries(o)) if (k !== 'login') addSecret(v);
for (const [k, v] of [['basic', basic], ['player', player], ['admin', admin]]) {
  if (!v.login || !v.password) {
    console.error(`В файле учёток нет login/password для секции ${k}`);
    process.exit(2);
  }
}

function totp(secret) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/[=\s]+/g, '').toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', key).update(c).digest();
  const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- данные для маршрутов и корзина игрока (через API на loopback, минуя nginx)
async function apiCall(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* не JSON */
  }
  if (json?.accessToken) addSecret(json.accessToken);
  return { status: res.status, json };
}
const arr = (j) => (Array.isArray(j) ? j : (j?.items ?? j?.data ?? j?.products ?? j?.results ?? []));
const products = arr((await apiCall('GET', '/store/products?limit=50')).json);
const productSlug = products[0]?.slug;
const newsSlug = arr((await apiCall('GET', '/news?limit=5')).json)[0]?.slug;
const pd = productSlug ? (await apiCall('GET', `/store/products/${productSlug}`)).json : null;
const variantId = (pd?.variants ?? []).find((v) => v.isActive !== false)?.id ?? pd?.variants?.[0]?.id;
let cartSeeded = false;
{
  const lg = await apiCall('POST', '/auth/login', { body: { emailOrUsername: player.login, password: player.password } });
  const t = lg.json?.accessToken;
  if (t && variantId) {
    await apiCall('DELETE', '/store/cart', { token: t });
    cartSeeded = (await apiCall('POST', '/store/cart/items', { token: t, body: { variantId, quantity: 1 } })).status < 300;
  }
}
console.log(`данные: товар=${productSlug ?? 'нет'} новость=${newsSlug ?? 'нет'} корзина=${cartSeeded ? 'есть товар' : 'НЕ засеяна'}`);

const PLAYER_PAGES = [
  ['/', 'home'],
  ['/shop', 'shop'],
  [productSlug ? `/shop/${productSlug}` : '/shop/none', 'shop-product'],
  ['/shop/cart', 'shop-cart'],
  ['/shop/checkout', 'shop-checkout'],
  ['/shop/orders', 'shop-orders'],
  ['/bans', 'bans'],
  ['/settings/punishments', 'settings-punishments'],
  [`/u/${player.login}`, 'profile'],
  ['/settings', 'settings'],
  ['/settings/inventory', 'settings-inventory'],
  ['/leaderboards', 'leaderboards'],
  ['/news', 'news'],
  [newsSlug ? `/news/${newsSlug}` : '/news/none', 'news-item'],
  ['/events', 'events'],
  ['/rules', 'rules'],
  ['/faq', 'faq'],
  ['/friends', 'friends'],
  ['/messages', 'messages'],
];
const ADMIN_PAGES = [
  ['/admin/store/products', 'admin-store-products'],
  ['/admin/store/orders', 'admin-store-orders'],
  ['/admin/store/delivery', 'admin-store-delivery'],
  ['/admin/streams', 'admin-streams'],
  ['/admin/store/stats', 'admin-store-stats'],
];

const browser = await chromium.launch({ headless: true });

// Вход на стенд: форма /__stand/login (cookie __Host-stand_gate кладётся в контекст). Пароль берётся из секции формы входа на стенд файла учёток (историческое имя «basic auth») и не печатается.
async function newContext(w) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, locale: 'ru-RU' });
  const r = await ctx.request.post(`${BASE}/__stand/login`, {
    form: { password: basic.password, next: '/' },
    headers: { origin: BASE },
    maxRedirects: 0,
  });
  if (r.status() !== 303) {
    console.error(`Вход на стенд не удался: HTTP ${r.status()}`);
    process.exit(2);
  }
  return ctx;
}

async function uiLogin(page, who, withTotp) {
  await page.goto(`${BASE}/login?next=/`, { waitUntil: 'load', timeout: 45000 });
  await page.fill('input[name="emailOrUsername"]', who.login);
  await page.fill('input[name="password"]', who.password);
  await page.click('button[type="submit"]');
  const otp = page.locator('input[autocomplete="one-time-code"]');
  const outcome = await Promise.race([
    otp.waitFor({ timeout: 15000 }).then(() => '2fa'),
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 }).then(() => 'in'),
  ]).catch(() => 'timeout');
  if (outcome === '2fa') {
    if (!withTotp || !who.totp_secret) throw new Error('требуется 2FA, секрета нет');
    if (30000 - (Date.now() % 30000) < 3000) await sleep(3500);
    await otp.first().fill(totp(who.totp_secret)); // OtpInput отправляет форму сам при вводе 6 цифр
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
  } else if (outcome === 'timeout') {
    throw new Error('вход не завершился (таймаут), URL ' + new URL(page.url()).pathname);
  }
}

const MEASURE = (isMobile) => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity !== 0;
  };
  const desc = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = !id && typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : '';
    const txt = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.getAttribute('href') || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return `${el.tagName.toLowerCase()}${id}${cls}[${txt}]`;
  };
  const out = { hscroll: document.documentElement.scrollWidth > window.innerWidth, scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, wide: [], small: [], smallCount: 0 };
  if (out.hscroll) {
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > window.innerWidth + 1 && vis(el)) {
        out.wide.push(`${desc(el)} right=${Math.round(r.right)}`);
        if (out.wide.length >= 3) break;
      }
    }
  }
  if (isMobile) {
    const sel = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"], [role="menuitem"]';
    for (const el of document.querySelectorAll(sel)) {
      if (!vis(el) || el.disabled) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) {
        out.smallCount++;
        if (out.small.length < 10) out.small.push(`${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
  }
  const h1 = document.querySelector('h1');
  out.title = document.title.slice(0, 60);
  out.h1 = (h1?.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return out;
};

const results = [];
async function runRole(roleName, who, withTotp, pages) {
  const ctx = await newContext(WIDTHS[0]);
  const page = await ctx.newPage();
  let cons = [];
  let bad = [];
  page.on('console', (m) => {
    if (m.type() === 'error') cons.push(`console: ${m.text().slice(0, 140)}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) bad.push(r.status() + ' ' + new URL(r.url()).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id').slice(0, 80));
  });
  page.on('pageerror', (e) => cons.push(`pageerror: ${String(e.message).slice(0, 140)}`));
  await uiLogin(page, who, withTotp);
  console.log(`вход ${roleName}: ok`);
  mkdirSync(`${OUT}/${roleName}`, { recursive: true });
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 800 });
    for (const [path, slug] of pages) {
      cons = [];
      bad = [];
      const row = { role: roleName, path, width: w, status: 0, finalPath: '', hscroll: null, small: [], smallCount: 0, console: [], badResponses: [], wide: [], title: '', h1: '', shot: '', note: '' };
      try {
        const resp = await page.goto(BASE + path, { waitUntil: 'load', timeout: 45000 });
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        await sleep(600);
        row.status = resp?.status() ?? 0;
        row.finalPath = new URL(page.url()).pathname;
        const m = await page.evaluate(MEASURE, w < 768);
        Object.assign(row, { hscroll: m.hscroll, small: m.small, smallCount: m.smallCount, wide: m.wide, title: m.title, h1: m.h1 });
        row.shot = `${roleName}/${slug}-${w}.png`;
        await page.screenshot({ path: `${OUT}/${row.shot}`, fullPage: true, timeout: 30000 });
      } catch (e) {
        row.note = 'ОШИБКА: ' + String(e?.message ?? e).split('\n')[0].slice(0, 160);
      }
      row.console = [...new Set(cons)].slice(0, 5);
      row.badResponses = [...new Set(bad)].slice(0, 6);
      if (row.finalPath && row.finalPath !== path && !row.note) row.note = `редирект -> ${row.finalPath}`;
      results.push(row);
      console.log(`${roleName} ${w} ${path} -> ${row.status} hscroll=${row.hscroll} small=${row.smallCount} console=${row.console.length}${row.note ? ' ' + row.note : ''}`);
      await sleep(300);
    }
  }
  await ctx.close();
}

try {
  await runRole('player', player, false, PLAYER_PAGES);
  await runRole('admin', admin, true, ADMIN_PAGES);
} finally {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/results.json`, mask(JSON.stringify(results, null, 2)));
  await browser.close();
}
const bad = results.filter((r) => r.status >= 400 || r.status === 0 || r.hscroll || r.console.length || r.note.startsWith('ОШИБКА')).length;
console.log(`ИТОГО: пар ${results.length}, с замечаниями ${bad}`);
