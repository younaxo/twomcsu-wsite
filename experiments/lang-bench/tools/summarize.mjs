// Сводка результатов bench/run-bench.sh: медиана по повторам. Использование: node tools/summarize.mjs <каталог результатов>
// Вход: <impl>-c<N>-r<K>.json (вывод oha --output-format json), <impl>-c<N>-r<K>.stats.csv (docker stats: "CPU%;MEM / LIMIT"),
//       <impl>-static.json (cold_start_ms, image_bytes), meta.json. Выход: summary.json и summary.md в том же каталоге.
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
  return { cpuAvg: ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null, rssPeak: mems.length ? Math.max(...mems.filter(Number.isFinite)) : null };
}

const files = readdirSync(dir).filter((f) => /-c\d+-r\d+\.json$/.test(f));
const groups = new Map(); // "impl|c" -> [{rps,p50,p95,p99,errPct,cpu,rss}]
for (const f of files) {
  const [, impl, c, r] = /^(.+)-c(\d+)-r(\d+)\.json$/.exec(f);
  const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const lp = j.latencyPercentiles ?? {};
  const st = readStats(join(dir, `${impl}-c${c}-r${r}.stats.csv`));
  const sd = j.statusCodeDistribution ?? {};
  const total = Object.values(sd).reduce((a, b) => a + b, 0);
  const non200 = total - (sd['200'] ?? 0);
  const key = `${impl}|${c}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({
    rps: j.summary?.requestsPerSec, p50: lp.p50 * 1000, p95: lp.p95 * 1000, p99: lp.p99 * 1000,
    errPct: total ? (100 * non200) / total : null, cpu: st.cpuAvg, rss: st.rssPeak,
  });
}

const rows = [];
for (const [key, runs] of [...groups.entries()].sort()) {
  const [impl, c] = key.split('|');
  const s = existsSync(join(dir, `${impl}-static.json`)) ? JSON.parse(readFileSync(join(dir, `${impl}-static.json`), 'utf8')) : {};
  rows.push({
    impl, concurrency: Number(c), repeats: runs.length,
    rps: median(runs.map((x) => x.rps)), p50_ms: median(runs.map((x) => x.p50)), p95_ms: median(runs.map((x) => x.p95)), p99_ms: median(runs.map((x) => x.p99)),
    err_pct: median(runs.map((x) => x.errPct)), cpu_pct_avg: median(runs.map((x) => x.cpu)), rss_peak_mib: (median(runs.map((x) => x.rss)) ?? NaN) / 1024 ** 2,
    cold_start_ms: s.cold_start_ms ?? null, image_mib_measured: s.image_bytes ? s.image_bytes / 1024 ** 2 : null,
  });
}
writeFileSync(join(dir, 'summary.json'), JSON.stringify(rows, null, 2) + '\n');

const f1 = (x, d = 1) => (x === null || !Number.isFinite(x) ? '-' : x.toFixed(d));
let md = '| вариант | параллелизм | повторов | RPS | p50, мс | p95, мс | p99, мс | ошибки, % | CPU, % (медиана средних) | RSS пик, МиБ | холодный старт, мс | образ, МиБ (измерено) |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n';
for (const r of rows) md += `| ${r.impl} | ${r.concurrency} | ${r.repeats} | ${f1(r.rps, 0)} | ${f1(r.p50_ms, 2)} | ${f1(r.p95_ms, 2)} | ${f1(r.p99_ms, 2)} | ${f1(r.err_pct, 2)} | ${f1(r.cpu_pct_avg)} | ${f1(r.rss_peak_mib)} | ${f1(r.cold_start_ms, 0)} | ${f1(r.image_mib_measured)} |\n`;
writeFileSync(join(dir, 'summary.md'), md);
console.log(md);
