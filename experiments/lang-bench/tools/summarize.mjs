// Сводка результатов bench/run-bench.sh: медиана по повторам. Использование: node tools/summarize.mjs <каталог результатов>
// Вход: <impl>-c<N>-r<K>.json (вывод oha --output-format json), <impl>-c<N>-r<K>.stats.csv (docker stats сервера: "CPU%;MEM / LIMIT"),
//       <impl>-c<N>-r<K>.loadgen.csv (то же для нагрузчика oha, M5), <impl>-static.json (image_bytes), <impl>-cold-r<K>.json (cold_start_ms),
//       meta.json. Выход: summary.json и summary.md в том же каталоге.
//
// ЕДИНОЕ ПРАВИЛО СРАВНЕНИЯ (B1; то же в docs/reports/lang-bench-plan.md и docs/architecture/POLYGLOT-ANALYSIS.md):
//   каждый вариант сравнивается И с (a) ts-current, И с (b) ts-batch; прирост = база / вариант по p95 (снижение задержки) и вариант / база по RPS.
//   Класс по приросту p95: менее 30 % -> "менее 30 %"; от 30 % до 2x (не включая 2x) -> "серая зона"; 2x и более -> "2x и более".
//   РЕШЕНИЕ принимается по сравнению с (b) ts-batch (иначе выигрыш от исправления N+1 припишется языку); сравнение с (a) - справочное
//   (показывает полный эффект, включая N+1). Замер чистой логики (DB_LATENCY_MS=0) не заменяет сквозной.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('Использование: node tools/summarize.mjs <каталог>'); process.exit(2); }

const median = (xs) => { const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const UNITS = { B: 1, KIB: 1024, MIB: 1024 ** 2, GIB: 1024 ** 3, KB: 1e3, MB: 1e6, GB: 1e9 };
const toBytes = (s) => { const m = /^([\d.]+)\s*([A-Za-z]+)/.exec(s.trim()); return m ? Number(m[1]) * (UNITS[m[2].toUpperCase()] ?? NaN) : NaN; };

function readStats(path) {
  if (!existsSync(path)) return { cpuAvg: null, rssPeak: null };
  const cpus = []; const mems = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const [cpu, mem] = line.split(';');
    if (!mem) continue;
    cpus.push(parseFloat(cpu)); mems.push(toBytes(mem.split('/')[0]));
  }
  const ok = cpus.filter((x) => Number.isFinite(x));
  const okMem = mems.filter(Number.isFinite);
  return { cpuAvg: ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null, rssPeak: okMem.length ? Math.max(...okMem) : null };
}

const meta = existsSync(join(dir, 'meta.json')) ? JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) : {};
const LOADGEN_NCPU = Number(meta.loadgen_ncpu ?? 2);
const SATURATION_PCT = 0.8 * 100 * LOADGEN_NCPU; // средний CPU нагрузчика >= 80 % его ядер: нагрузчик - узкое место, результат занижен

const files = readdirSync(dir).filter((f) => /-c\d+-r\d+\.json$/.test(f));
const groups = new Map(); // "impl|c" -> [{rps,p50,p95,p99,errPct,cpu,rss,lgCpu,lgRss,connErrors,errDist}]
for (const f of files) {
  const [, impl, c, r] = /^(.+)-c(\d+)-r(\d+)\.json$/.exec(f);
  const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const lp = j.latencyPercentiles ?? {};
  const st = readStats(join(dir, `${impl}-c${c}-r${r}.stats.csv`));
  const lg = readStats(join(dir, `${impl}-c${c}-r${r}.loadgen.csv`));
  const sd = j.statusCodeDistribution ?? {};
  const errDist = j.errorDistribution ?? {}; // ошибки соединения/таймауты oha: {сообщение: число}
  const errCount = Object.values(errDist).reduce((a, b) => a + b, 0);
  const total = Object.values(sd).reduce((a, b) => a + b, 0);
  const non200 = total - (sd['200'] ?? 0);
  const key = `${impl}|${c}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({
    rps: j.summary?.requestsPerSec, p50: lp.p50 * 1000, p95: lp.p95 * 1000, p99: lp.p99 * 1000,
    errPct: total ? (100 * non200) / total : null, cpu: st.cpuAvg, rss: st.rssPeak,
    lgCpu: lg.cpuAvg, lgRss: lg.rssPeak, connErrors: errCount, errDist,
  });
}

const rows = [];
for (const [key, runs] of [...groups.entries()].sort()) {
  const [impl, c] = key.split('|');
  const s = existsSync(join(dir, `${impl}-static.json`)) ? JSON.parse(readFileSync(join(dir, `${impl}-static.json`), 'utf8')) : {};
  const colds = readdirSync(dir).filter((f) => f.startsWith(`${impl}-cold-r`)).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')).cold_start_ms);
  const errDist = {};
  for (const x of runs) for (const [k, v] of Object.entries(x.errDist)) if (v > 0) errDist[k] = (errDist[k] ?? 0) + v;
  const lgCpu = median(runs.map((x) => x.lgCpu));
  rows.push({
    impl, concurrency: Number(c), repeats: runs.length,
    rps: median(runs.map((x) => x.rps)), p50_ms: median(runs.map((x) => x.p50)), p95_ms: median(runs.map((x) => x.p95)), p99_ms: median(runs.map((x) => x.p99)),
    err_pct: median(runs.map((x) => x.errPct)), cpu_pct_avg: median(runs.map((x) => x.cpu)), rss_peak_mib: (median(runs.map((x) => x.rss)) ?? NaN) / 1024 ** 2,
    cold_start_ms: median(colds) ?? s.cold_start_ms ?? null, image_mib_measured: s.image_bytes ? s.image_bytes / 1024 ** 2 : null,
    loadgen_cpu_pct_avg: lgCpu, loadgen_rss_peak_mib: (median(runs.map((x) => x.lgRss)) ?? NaN) / 1024 ** 2,
    loadgen_saturated: lgCpu !== null && lgCpu >= SATURATION_PCT,
    conn_errors: runs.reduce((a, x) => a + x.connErrors, 0), error_distribution: errDist,
  });
}

// Сравнение с (a) ts-current и (b) ts-batch (единое правило, см. шапку файла)
const BASES = ['ts-current', 'ts-batch'];
const klass = (gain) => (gain < 0.3 ? 'менее 30 %' : gain < 1 ? 'серая зона (30 % - 2x)' : '2x и более');
const comparisons = [];
for (const x of rows) {
  for (const base of BASES) {
    if (x.impl === base || x.impl === 'ts-current') continue; // (a) сам себе и (b) не база
    const b = rows.find((r) => r.impl === base && r.concurrency === x.concurrency);
    if (!b || !(b.p95_ms > 0) || !(x.p95_ms > 0)) continue;
    const p95Gain = b.p95_ms / x.p95_ms - 1;
    const rpsGain = b.rps > 0 && x.rps > 0 ? x.rps / b.rps - 1 : null;
    comparisons.push({ impl: x.impl, base, concurrency: x.concurrency, p95_gain: p95Gain, rps_gain: rpsGain, class_by_p95: klass(p95Gain), decisive: base === 'ts-batch' });
  }
}
writeFileSync(join(dir, 'summary.json'), JSON.stringify({ meta, rows, comparisons }, null, 2) + '\n');

const f1 = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '-' : x.toFixed(d));
const pct = (x) => (x === null || !Number.isFinite(x) ? '-' : `${x >= 0 ? '+' : ''}${(100 * x).toFixed(0)} %`);
let md = '| вариант | параллелизм | повторов | RPS | p50, мс | p95, мс | p99, мс | ошибки, % | CPU, % (медиана средних) | RSS пик, МиБ | холодный старт, мс (медиана) | образ, МиБ (измерено) |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n';
for (const r of rows) md += `| ${r.impl} | ${r.concurrency} | ${r.repeats} | ${f1(r.rps, 0)} | ${f1(r.p50_ms, 2)} | ${f1(r.p95_ms, 2)} | ${f1(r.p99_ms, 2)} | ${f1(r.err_pct, 2)} | ${f1(r.cpu_pct_avg)} | ${f1(r.rss_peak_mib)} | ${f1(r.cold_start_ms, 0)} | ${f1(r.image_mib_measured)} |\n`;

md += '\n### Сравнение с (a) ts-current и (b) ts-batch\n\nПрирост: p95 = база / вариант - 1; RPS = вариант / база - 1. Решение - по (b) ts-batch; (a) справочно (включает эффект N+1). Замер чистой логики не заменяет сквозной.\n\n| вариант | база | параллелизм | прирост p95 | прирост RPS | класс (по p95) | решающее |\n|---|---|---|---|---|---|---|\n';
for (const c of comparisons) md += `| ${c.impl} | ${c.base} | ${c.concurrency} | ${pct(c.p95_gain)} | ${pct(c.rps_gain)} | ${c.class_by_p95} | ${c.decisive ? 'да' : 'нет'} |\n`;

md += '\n### Нагрузчик (oha) и ошибки\n\n| вариант | параллелизм | CPU нагрузчика, % (медиана средних) | RSS нагрузчика пик, МиБ | насыщение нагрузчика | ошибки соединения (сумма) | errorDistribution |\n|---|---|---|---|---|---|---|\n';
for (const r of rows) {
  const ed = Object.keys(r.error_distribution).length ? Object.entries(r.error_distribution).map(([k, v]) => `${k}: ${v}`).join('; ') : '-';
  md += `| ${r.impl} | ${r.concurrency} | ${f1(r.loadgen_cpu_pct_avg)} | ${f1(r.loadgen_rss_peak_mib)} | ${r.loadgen_saturated ? 'ДА: результат занижен нагрузчиком' : 'нет'} | ${r.conn_errors} | ${ed} |\n`;
}
const flagged = rows.filter((r) => r.conn_errors > 0 || r.err_pct > 0 || r.loadgen_saturated);
if (flagged.length) {
  md += '\nВНИМАНИЕ:\n';
  for (const r of flagged) {
    const why = [];
    if (r.err_pct > 0) why.push(`ответы не 200: ${f1(r.err_pct, 2)} %`);
    if (r.conn_errors > 0) why.push(`ошибки соединения: ${r.conn_errors}`);
    if (r.loadgen_saturated) why.push(`нагрузчик насыщен (CPU ${f1(r.loadgen_cpu_pct_avg)} % при пороге ${SATURATION_PCT} %)`);
    md += `- ${r.impl}, c=${r.concurrency}: ${why.join('; ')} - строки с ошибками или насыщением нельзя использовать для выводов без разбора.\n`;
  }
}
writeFileSync(join(dir, 'summary.md'), md);
console.log(md);
