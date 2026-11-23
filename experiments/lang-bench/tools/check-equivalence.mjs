// Проверка эквивалентности реализаций расчёта корзины (Node, без зависимостей; нужен Node >= 22.18 для .ts).
//   node tools/check-equivalence.mjs --inproc ts-current,ts-batch
//   node tools/check-equivalence.mjs --http ts-current=http://127.0.0.1:8081,ts-batch=http://127.0.0.1:8082,rust=http://127.0.0.1:8083,java=http://127.0.0.1:8084
// Опции: --golden fixtures/golden.json  --carts generated/carts.json  --dataset fixtures/dataset.json  --min-carts 1000
// Правила: 1) golden должен совпасть с КАЖДОЙ реализацией (ожидания посчитаны вручную);
//          2) на сгенерированных корзинах все реализации совпадают с первой (сравнение JSON как значения, деньги - строками);
//          3) денежные строки в каноническом виде; 4) для 400 сравнивается status и code (message не сравнивается).
// Код возврата: 0 - расхождений нет, 1 - есть расхождения, 2 - ошибка запуска.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : dflt; };
const goldenPath = join(root, opt('golden', 'fixtures/golden.json'));
const cartsPath = join(root, opt('carts', 'generated/carts.json'));
const datasetPath = join(root, opt('dataset', 'fixtures/dataset.json'));
const MIN_CARTS = Number(opt('min-carts', 1000));

const targets = []; // { name, call(request) -> {status, body} }
const inproc = opt('inproc', '');
for (const name of inproc ? inproc.split(',') : []) {
  const calc = await import(pathToFileURL(join(root, 'impl', name, 'calc.ts')).href);
  const { MemoryStore } = await import(pathToFileURL(join(root, 'impl', name, 'store.ts')).href);
  const store = new MemoryStore(datasetPath, 0);
  // c.rawBody (если есть) идёт через parseJsonBody - как тело HTTP-запроса сервера (различие 5 и 5.0 сохраняется)
  targets.push({
    name: `inproc:${name}`,
    call: (c) => {
      if (c.rawBody === undefined) return calc.calculate(structuredClone(c.request), store);
      let parsed;
      try { parsed = calc.parseJsonBody(c.rawBody); } catch { return Promise.resolve({ status: 400, body: { code: 'VALIDATION' } }); }
      return calc.calculate(parsed, store);
    },
  });
}
const http = opt('http', '');
for (const pair of http ? http.split(',') : []) {
  const [name, url] = pair.split('=');
  targets.push({
    name: `http:${name}`,
    call: async (c) => {
      const body = c.rawBody !== undefined ? c.rawBody : JSON.stringify(c.request);
      const res = await fetch(`${url}/store/cart/calculate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      return { status: res.status, body: await res.json() };
    },
  });
}
if (targets.length < 2) { console.error('Нужно минимум две реализации (--inproc и/или --http)'); process.exit(2); }

const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));
const view = (r) => (r.status === 200 ? { status: 200, body: r.body } : { status: r.status, body: { code: r.body?.code } });
const MONEY = /^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/;
function moneyProblems(body) {
  const out = [];
  const fields = ['subtotal', 'bulkDiscountTotal', 'loyaltyDiscountPercent', 'loyaltyDiscountTotal', 'promoDiscountTotal', 'discountAmount', 'total'];
  for (const f of fields) if (typeof body[f] !== 'string' || !MONEY.test(body[f])) out.push(`${f}=${JSON.stringify(body[f])}`);
  for (const l of body.lines ?? []) for (const f of ['unitPrice', 'lineSubtotal', 'bulkDiscount', 'lineTotal']) if (typeof l[f] !== 'string' || !MONEY.test(l[f])) out.push(`lines.${f}=${JSON.stringify(l[f])}`);
  return out;
}

let failures = 0;
const report = (msg) => { failures += 1; if (failures <= 20) console.log(`РАСХОЖДЕНИЕ: ${msg}`); };

const golden = JSON.parse(readFileSync(goldenPath, 'utf8')).cases;
for (const t of targets) {
  let bad = 0;
  for (const c of golden) {
    const got = view(await t.call(c));
    if (got.status === 200) for (const p of moneyProblems(got.body)) { report(`${t.name} golden "${c.name}": неканонический формат ${p}`); bad += 1; }
    if (canon(got) !== canon(c.expected)) { bad += 1; report(`${t.name} golden "${c.name}"\n  ожидалось ${canon(c.expected)}\n  получено  ${canon(got)}`); }
  }
  console.log(`golden ${t.name}: ${golden.length - bad}/${golden.length}${bad ? '  НЕ СОВПАЛО' : ''}`);
}

const carts = JSON.parse(readFileSync(cartsPath, 'utf8')).carts;
if (carts.length < MIN_CARTS) { console.error(`Корзин ${carts.length} < ${MIN_CARTS}: запустите tools/gen-carts.mjs (или --min-carts)`); process.exit(2); }
const [ref, ...others] = targets;
let compared = 0;
let ok200 = 0;
let err400 = 0;
const CONCURRENCY = 16;
for (let i = 0; i < carts.length; i += CONCURRENCY) {
  const batch = carts.slice(i, i + CONCURRENCY);
  await Promise.all(batch.map(async (c) => {
    const want = view(await ref.call(c));
    if (want.status === 200) { ok200 += 1; for (const p of moneyProblems(want.body)) report(`${ref.name} ${c.name}: неканонический формат ${p}`); } else err400 += 1;
    for (const t of others) {
      const got = view(await t.call(c));
      compared += 1;
      if (canon(got) !== canon(want)) report(`${c.name}: ${t.name} != ${ref.name}\n  ${ref.name}: ${canon(want).slice(0, 400)}\n  ${t.name}: ${canon(got).slice(0, 400)}`);
    }
  }));
}
console.log(`сгенерированных корзин: ${carts.length} (200: ${ok200}, 400: ${err400}); сравнений с эталоном ${ref.name}: ${compared}`);
console.log(failures === 0 ? 'ИТОГ: расхождений 0' : `ИТОГ: расхождений ${failures}`);
process.exit(failures === 0 ? 0 : 1);
