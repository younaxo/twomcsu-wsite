#!/usr/bin/env node
// PreToolUse-хук (matcher "Bash|PowerShell"): запрещает запуск Python/pip в позиции команды.
// Вход: JSON в stdin ({tool_input:{command}}). Отказ: exit 2 + сообщение в stderr.
// Fail-safe: ошибка разбора stdin или исключение в анализаторе -> exit 0 (хук не ломает работу).
//
// Что ловится (статический разбор): python*/py/pypy*/ipython/jupyter/.bat/.exe, pip*/pipx,
// uv run|pip|python|tool|venv, uvx, poetry/pipenv/conda/pdm/hatch/rye run, pyenv exec,
// запуск *.py любым способом (прямой, bash x.py, source, `. x.py`), обёртки (sudo, env -S, nice,
// ionice, timeout, flock, stdbuf, watch, taskset, chrt, xargs, find -exec, ssh, cmd /c,
// powershell -c/-EncodedCommand, wsl, su -c, eval, iex, Start-Process), позиции после
// then/else/elif/do/{/!/if/while/until/time, подстановки $(...) и `...`, heredoc.
// Не блокируются проверки наличия: command -v/-V, type, which, hash.
// Allow-лист (python-allow.txt): нормализация пути, граница каталога, отказ при выходе за корень.
//
// ИЗВЕСТНЫЕ ОГРАНИЧЕНИЯ (не ловится): динамическая сборка имени ($PY, ${x}, base64 | sh,
// node -e "execSync('py'+'thon')", brace expansion {python,x}), docker/kubectl exec,
// скрипт, записанный в файл и затем запущенный (кроме *.py), символьные ссылки в allow-листе,
// экранирование обратной кавычкой в PowerShell. Хук — барьер от случайного запуска, не security boundary.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MESSAGE = 'Python запрещён, используй node/bash';
const here = path.dirname(fileURLToPath(import.meta.url));
const S = (...a) => new Set(a);

// ---------- allow-лист ----------
function toPosix(p) {
  p = p.replace(/\\/g, '/');
  if (process.platform === 'win32') {
    const m = p.match(/^\/([a-zA-Z])\/(.*)$/);
    if (m) p = m[1].toUpperCase() + ':/' + m[2];
  }
  return p.replace(/^([a-z]):/, (_, d) => d.toUpperCase() + ':');
}

// Путь относительно корня проекта (нормализованный) или null, если он вне корня / выходит за него.
function relPath(file) {
  const p = toPosix(file);
  const root = toPosix(process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\/+$/, '');
  let n = path.posix.normalize(p);
  if (p.startsWith('/') || /^[A-Z]:\//.test(p)) {
    const ci = /^[A-Z]:/.test(root);
    const a = ci ? n.toLowerCase() : n;
    const r = ci ? root.toLowerCase() : root;
    if (!a.startsWith(r + '/')) return null;
    n = n.slice(root.length + 1);
  }
  n = n.replace(/\/+$/, '');
  if (n === '..' || n.startsWith('../') || n.startsWith('/')) return null;
  return n;
}

function loadAllow() {
  try {
    return fs
      .readFileSync(path.join(here, 'python-allow.txt'), 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch {
    return [];
  }
}

function allowed(file, allow) {
  if (!file || /[$`*?~{}[\]\u0001]/.test(file)) return false;
  const n = relPath(file);
  if (n === null || !/\.py$/i.test(n)) return false;
  for (const raw of allow) {
    const e = relPath(raw);
    if (e === null || e === '' || e === '.') continue;
    if (n === e || n.startsWith(e + '/')) return true;
  }
  return false;
}

// ---------- лексер ----------
function skipArith(src, i) {
  let d = 2;
  while (i < src.length && d > 0) {
    if (src[i] === '(') d++;
    else if (src[i] === ')') d--;
    i++;
  }
  return i;
}

// Двойные кавычки (endCh='"') или тело неквотированного heredoc (endCh=null).
function dq(src, i, ctx, endCh) {
  let text = '';
  while (i < src.length && (endCh === null || src[i] !== endCh)) {
    const c = src[i];
    if (c === '\\') {
      const n = src[i + 1];
      if (n !== undefined && '$`"\\\n'.includes(n)) {
        if (n !== '\n') text += n;
        i += 2;
      } else {
        text += c;
        i++;
      }
    } else if (c === '$' && src[i + 1] === '(') {
      i = src[i + 2] === '(' ? skipArith(src, i + 3) : parse(src, i + 2, ctx, ')');
      text += '\u0001';
    } else if (c === '`') {
      i = parse(src, i + 1, ctx, '`');
      text += '\u0001';
    } else {
      text += c;
      i++;
    }
  }
  return { end: i, text };
}

function readBodies(src, i, pend, ctx) {
  for (const h of pend) {
    const body = [];
    while (i < src.length) {
      let nl = src.indexOf('\n', i);
      if (nl === -1) nl = src.length;
      const line = src.slice(i, nl).replace(/\r$/, '');
      i = nl + 1;
      if ((h.dash ? line.replace(/^\t+/, '') : line) === h.delim) break;
      body.push(line);
    }
    h.body = body.join('\n');
    if (!h.quoted) dq(h.body, 0, ctx, null); // $(...) в неквотированном heredoc выполняется всегда
    ctx.heredocs.push(h);
  }
  return i;
}

function parse(src, i, ctx, term) {
  if (++ctx.nest > 40) {
    ctx.over = true;
    ctx.nest--;
    return src.length;
  }
  const r = parseInner(src, i, ctx, term);
  ctx.nest--;
  return r;
}

function parseInner(src, i, ctx, term) {
  let words = [];
  let cur = '';
  let has = false;
  let dropNext = false;
  let pipePrev = null;
  let depth = 0;
  const pend = [];
  const endWord = () => {
    if (has) {
      if (dropNext) dropNext = false;
      else words.push(cur);
    }
    cur = '';
    has = false;
  };
  const endSeg = (pipe) => {
    endWord();
    dropNext = false;
    if (pipePrev) {
      pipePrev.next = words;
      pipePrev = null;
    }
    if (pipe) pipePrev = words;
    if (words.length) ctx.segments.push(words);
    words = [];
  };
  const sub = (from, t) => {
    has = true;
    cur += '\u0001';
    return parse(src, from, ctx, t);
  };
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '\\') {
      if (n === undefined) i++;
      else if (n === '\n') i += 2;
      else {
        // буква/цифра/знак пути: оставляем обратный слэш (Windows-путь); bases() учитывает оба варианта
        cur += /[A-Za-z0-9._:\-=/,@%+]/.test(n) ? '\\' + n : n;
        has = true;
        i += 2;
      }
    } else if (c === "'") {
      const j = src.indexOf("'", i + 1);
      const end = j === -1 ? src.length : j;
      cur += src.slice(i + 1, end);
      has = true;
      i = end + 1;
    } else if (c === '"') {
      has = true;
      const r = dq(src, i + 1, ctx, '"');
      cur += r.text;
      i = r.end + 1;
    } else if (c === '$' && n === "'") {
      has = true;
      i += 2;
      while (i < src.length && src[i] !== "'") {
        if (src[i] === '\\' && i + 1 < src.length) {
          const m = src.slice(i + 1).match(/^(x[0-9a-fA-F]{1,2}|[0-7]{1,3}|[\s\S])/);
          const t = m[1];
          if (t[0] === 'x' && t.length > 1) cur += String.fromCharCode(parseInt(t.slice(1), 16));
          else if (/^[0-7]+$/.test(t)) cur += String.fromCharCode(parseInt(t, 8));
          else cur += t === 'n' ? '\n' : t === 't' ? '\t' : t;
          i += 1 + t.length;
        } else cur += src[i++];
      }
      i++;
    } else if (c === '$' && n === '"') {
      i++;
    } else if (c === '$' && n === '(') {
      if (src[i + 2] === '(') {
        has = true;
        cur += '0';
        i = skipArith(src, i + 3);
      } else i = sub(i + 2, ')');
    } else if (c === '`') {
      if (term === '`') {
        endSeg(false);
        return i + 1;
      }
      i = sub(i + 1, '`');
    } else if (c === '<' && n === '<') {
      if (src[i + 2] === '<') {
        endWord();
        i += 3;
      } else {
        let j = i + 2;
        let dash = false;
        if (src[j] === '-') {
          dash = true;
          j++;
        }
        while (src[j] === ' ' || src[j] === '\t') j++;
        let d = '';
        let quoted = false;
        while (j < src.length && !/[\s;&|()<>]/.test(src[j])) {
          const ch = src[j];
          if (ch === "'" || ch === '"') {
            quoted = true;
            const k = src.indexOf(ch, j + 1);
            const e = k === -1 ? src.length : k;
            d += src.slice(j + 1, e);
            j = e + 1;
          } else if (ch === '\\') {
            quoted = true;
            d += src[j + 1] ?? '';
            j += 2;
          } else {
            d += ch;
            j++;
          }
        }
        endWord();
        if (d !== '') pend.push({ delim: d, dash, quoted, ws: words });
        i = j;
      }
    } else if (c === '<' || c === '>') {
      if (n === '(') {
        i = sub(i + 2, ')');
        continue;
      }
      if (has && /^\d+$/.test(cur)) {
        cur = '';
        has = false;
      } else endWord();
      i++;
      while (src[i] === '>' || (c === '>' && src[i] === '|')) i++;
      if (src[i] === '&') i++;
      dropNext = true;
    } else if (c === '&' && n === '>') {
      endWord();
      i += 2;
      if (src[i] === '>') i++;
      dropNext = true;
    } else if (c === '&' && n === '&') {
      endSeg(false);
      i += 2;
    } else if (c === '|' && n === '|') {
      endSeg(false);
      i += 2;
    } else if (c === '|' && n === '&') {
      endSeg(true);
      i += 2;
    } else if (c === '|') {
      endSeg(true);
      i++;
    } else if (c === ';' || c === '&') {
      endSeg(false);
      i++;
    } else if (c === '\n') {
      endSeg(false);
      i++;
      if (pend.length) {
        i = readBodies(src, i, pend, ctx);
        pend.length = 0;
      }
    } else if (c === '(') {
      endSeg(false);
      depth++;
      i++;
    } else if (c === ')') {
      endSeg(false);
      i++;
      if (term === ')' && depth === 0) return i;
      if (depth > 0) depth--;
    } else if (c === ' ' || c === '\t' || c === '\r') {
      endWord();
      i++;
    } else {
      cur += c;
      has = true;
      i++;
    }
  }
  endSeg(false);
  return i;
}

// ---------- имена команд ----------
function bases(w) {
  const strip = (s) => s.split('/').pop().toLowerCase().replace(/\.(exe|bat|cmd|com)$/, '');
  const a = strip(w.replace(/\\/g, '/'));
  const b = strip(w.replace(/\\/g, ''));
  return a === b ? [a] : [a, b];
}
const isPyLike = (b) => /^(python|pypy|ipython)w?\d*(\.\d+)*$/.test(b) || b === 'py' || b === 'pyw';
const isInterp = (b) => isPyLike(b) || /^jupyter(-.+)?$/.test(b) || b === 'bpython';
const isPip = (b) => /^pip(\d+(\.\d+)*)?$/.test(b) || b === 'pipx';
const SHELLS = S('bash', 'sh', 'zsh', 'dash', 'ksh', 'ash', 'fish');
const STDIN_INTERP = S('ssh', 'wsl', 'su', 'runuser', 'powershell', 'pwsh', 'cmd');
const KW = S('if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', '{', 'coproc');
const ASSIGN = /^[A-Za-z_]\w*=/;
const RUNNERS = new Map([
  ['uv', S('run', 'pip', 'python', 'tool', 'venv')],
  ['poetry', S('run')],
  ['pipenv', S('run')],
  ['conda', S('run')],
  ['mamba', S('run')],
  ['micromamba', S('run')],
  ['pyenv', S('exec')],
  ['pdm', S('run')],
  ['hatch', S('run')],
  ['rye', S('run')],
]);

const XARGS_ARGS = S('-I', '-n', '-P', '-d', '-E', '-L', '-s', '-a', '--arg-file', '--max-args', '--max-procs', '--delimiter');
const WR = new Map(
  Object.entries({
    sudo: { a: S('-u', '-g', '-h', '-p', '-C', '-D', '-R', '-T', '-U', '--user', '--group', '--host') },
    doas: { a: S('-u', '-C') },
    env: {},
    nice: { a: S('-n', '--adjustment') },
    ionice: { a: S('-c', '-n', '-p', '-P', '-u', '-t') },
    timeout: { a: S('-s', '-k', '--signal', '--kill-after'), pos: 1 },
    xargs: { a: XARGS_ARGS },
    parallel: { a: S('-j', '-S', '-a', '-n', '-N', '-P', '-L', '-I') },
    flock: { a: S('-w', '-E', '--timeout', '--conflict-exit-code'), pos: 1 },
    stdbuf: { a: S('-i', '-o', '-e', '--input', '--output', '--error') },
    watch: { a: S('-n', '--interval', '-w') },
    taskset: { a: S('-c', '--cpu-list'), pos: 1 },
    chrt: { pos: 1 },
    nohup: {},
    setsid: {},
    exec: { a: S('-a') },
    builtin: {},
    command: {},
    time: {},
    unbuffer: {},
  }),
);
const ENV_ARGS = S('-u', '-C', '-P', '--unset', '--chdir');
const SSH_ARGS = S('-p', '-i', '-l', '-o', '-F', '-J', '-L', '-R', '-D', '-b', '-c', '-e', '-E', '-I', '-m', '-O', '-S', '-w', '-W', '-B');

function skipOpts(ws, i, withArg) {
  while (i < ws.length && ws[i].startsWith('-') && ws[i] !== '-') i += withArg.has(ws[i]) ? 2 : 1;
  return i;
}

// Снимает префиксы/обёртки. Возвращает индекс команды; out.checks — строки для рекурсивной проверки;
// out.bail — команда не исполняет аргумент (command -v и т.п.).
function unwrap(ws, out) {
  let i = 0;
  while (i < ws.length) {
    const w = ws[i];
    if (ASSIGN.test(w) || KW.has(w)) {
      i++;
      continue;
    }
    const name = bases(w).find((x) => WR.has(x));
    if (!name) break;
    const spec = WR.get(name);
    if (name === 'env') {
      let j = i + 1;
      while (j < ws.length && ws[j].startsWith('-') && ws[j] !== '-') {
        const t = ws[j];
        let str = null;
        if (t === '-S' || t === '--split-string') str = ws.slice(j + 1).join(' ');
        else if (t.startsWith('--split-string=')) str = t.slice(15) + ' ' + ws.slice(j + 1).join(' ');
        else if (/^-S./.test(t)) str = t.slice(2) + ' ' + ws.slice(j + 1).join(' ');
        if (str !== null) {
          out.checks.push(str);
          out.bail = true;
          return -1;
        }
        j += ENV_ARGS.has(t) ? 2 : 1;
      }
      i = j;
      continue;
    }
    if ((name === 'command' || name === 'builtin') && ws.slice(i + 1).some((a) => /^-[a-zA-Z]*[vV]/.test(a) && a !== '--')) {
      out.bail = true;
      return -1;
    }
    if (name === 'flock') {
      const k = ws.findIndex((a, x) => x > i && (a === '-c' || a === '--command'));
      if (k !== -1) {
        if (ws[k + 1] !== undefined) out.checks.push(ws[k + 1]);
        out.bail = true;
        return -1;
      }
    }
    const j = skipOpts(ws, i + 1, spec.a || new Set());
    let pos = spec.pos || 0;
    if (name === 'taskset') {
      const opts = ws.slice(i + 1, j);
      if (opts.includes('-p') || opts.includes('--pid')) {
        out.bail = true;
        return -1;
      }
      if (opts.includes('-c') || opts.includes('--cpu-list')) pos = 0;
    }
    if (name === 'watch' && j < ws.length) out.checks.push(ws.slice(j).join(' '));
    i = j + pos;
  }
  return i;
}

// ---------- python ----------
function pythonBlocked(rest, allow) {
  for (let k = 0; k < rest.length; k++) {
    const a = rest[k];
    if (a === '-' || !a.startsWith('-')) return !allowed(a === '-' ? null : a, allow);
    if (a.startsWith('--')) {
      if (a === '--check-hash-based-pycs') k++;
      continue;
    }
    for (let q = 1; q < a.length; q++) {
      const ch = a[q];
      if (ch === 'c' || ch === 'm') return true;
      if ('WXQ'.includes(ch)) {
        if (q === a.length - 1) k++;
        break;
      }
    }
  }
  return true; // нет скрипта: REPL/stdin/--version
}

function shellScript(rest) {
  for (let k = 0; k < rest.length; k++) {
    const a = rest[k];
    if (a === '--') continue;
    if (a.startsWith('-') || a.startsWith('+')) {
      if (a === '-o' || a === '-O' || a === '--rcfile' || a === '--init-file') k++;
      continue;
    }
    return a;
  }
  return null;
}

function evalCmd(b, cmd, rest, allow, depth) {
  const chk = (s) => check(s, allow, depth + 1);
  if (isPip(b)) return true;
  if (isInterp(b)) return isPyLike(b) ? pythonBlocked(rest, allow) : true;
  if (b === 'uvx') return true;
  if (RUNNERS.has(b)) return rest.slice(0, 6).some((a) => RUNNERS.get(b).has(a));
  if (SHELLS.has(b)) {
    const k = rest.findIndex((a) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a));
    if (k !== -1) return rest[k + 1] !== undefined && chk(rest[k + 1]);
    const sc = shellScript(rest);
    return sc !== null && /\.py$/i.test(sc) && !allowed(sc, allow);
  }
  if (b === 'source' || b === '.') {
    const sc = rest.find((a) => !a.startsWith('-'));
    return sc !== undefined && /\.py$/i.test(sc) && !allowed(sc, allow);
  }
  if (b === 'eval' || b === 'iex' || b === 'invoke-expression') return chk(rest.join(' '));
  if (b === 'ssh') {
    const j = skipOpts(rest, 0, SSH_ARGS);
    let r = rest.slice(j + 1);
    if (r[0] === '--') r = r.slice(1);
    return chk(r.join(' '));
  }
  if (b === 'cmd') {
    const k = rest.findIndex((a) => /^\/[ck]$/i.test(a));
    return k !== -1 && chk(rest.slice(k + 1).join(' '));
  }
  if (b === 'powershell' || b === 'pwsh') {
    const k = rest.findIndex((a) => /^-c(o(m(m(a(n(d)?)?)?)?)?)?$/i.test(a));
    if (k !== -1 && chk(rest.slice(k + 1).join(' '))) return true;
    const e = rest.findIndex((a) => /^-(e|ec|enc|encodedcommand)$/i.test(a));
    if (e !== -1 && rest[e + 1] !== undefined) {
      try {
        return chk(Buffer.from(rest[e + 1], 'base64').toString('utf16le'));
      } catch {
        return false;
      }
    }
    return false;
  }
  if (b === 'wsl') {
    let j = 0;
    while (j < rest.length && rest[j].startsWith('-') && !['-e', '--exec', '--'].includes(rest[j])) {
      j += ['-d', '--distribution', '-u', '--user', '--cd', '--shell-type'].includes(rest[j]) ? 2 : 1;
    }
    if (['-e', '--exec', '--'].includes(rest[j])) j++;
    return chk(rest.slice(j).join(' '));
  }
  if (b === 'su' || b === 'runuser' || b === 'sg' || b === 'script') {
    const k = rest.findIndex((a) => a === '--command' || /^-[a-z]*c$/.test(a));
    return k !== -1 && rest[k + 1] !== undefined && chk(rest[k + 1]);
  }
  if (b === 'find' || b === 'gfind') {
    for (let k = 0; k < rest.length; k++) {
      if (!/^-(exec|execdir|ok|okdir)$/.test(rest[k])) continue;
      let e = k + 1;
      while (e < rest.length && rest[e] !== ';' && rest[e] !== '+') e++;
      if (evalSeg(rest.slice(k + 1, e), allow, depth + 1)) return true;
    }
    return false;
  }
  if (b === 'start-process' || b === 'saps' || b === 'start') {
    return evalSeg(rest.filter((a) => !a.startsWith('-')), allow, depth + 1);
  }
  return false;
}

function evalSeg(ws, allow, depth) {
  if (depth > 8) return true;
  const out = { checks: [], bail: false };
  const i = unwrap(ws, out);
  for (const s of out.checks) if (check(s, allow, depth + 1)) return true;
  if (out.bail || i < 0 || i >= ws.length) return false;
  const cmd = ws[i];
  const rest = ws.slice(i + 1);
  for (const b of bases(cmd)) if (evalCmd(b, cmd, rest, allow, depth)) return true;
  return /\.py$/i.test(cmd) && !allowed(cmd, allow);
}

// Читает ли команда (или следующая в конвейере) stdin как код.
function feedsInterp(ws) {
  for (let k = 0; ws && k < 6; k++, ws = ws.next) {
    const out = { checks: [], bail: false };
    const i = unwrap(ws, out);
    if (i < 0 || i >= ws.length) continue;
    if (bases(ws[i]).some((b) => SHELLS.has(b) || isInterp(b) || STDIN_INTERP.has(b))) return true;
  }
  return false;
}

export function check(command, allow = loadAllow(), depth = 0) {
  if (typeof command !== 'string') return false;
  if (depth > 8) return true;
  const ctx = { segments: [], heredocs: [], nest: 0, over: false };
  parse(command, 0, ctx, null);
  if (ctx.over) return true;
  for (const seg of ctx.segments) if (evalSeg(seg, allow, depth)) return true;
  for (const h of ctx.heredocs) if (feedsInterp(h.ws) && check(h.body, allow, depth + 1)) return true;
  return false;
}

// ---------- selftest ----------
function selftest() {
  process.env.CLAUDE_PROJECT_DIR = '/proj';
  const allow = ['tools/ok/'];
  const b64 = Buffer.from('python x', 'utf16le').toString('base64');
  const pos = [
    // базовые
    'python --version', 'python3 x.js', 'python3.11 -V', 'python.exe -V', '/usr/bin/python3 -V',
    '"C:\\Python312\\python.exe" -V', 'py -3 script.py', 'pip install requests', 'pip3 install x',
    'pipx run foo', 'python -m pip install x', './script.py', 'scripts/run.py --flag', 'ls && python3 x',
    'ls; python x', 'false || python x', 'echo hi | python -c "print(1)"', '(python x)', 'echo $(python3 -V)',
    'echo `python -V`', 'echo "$(python3 -V)"', 'ls\npython x', 'sudo python3 x', 'sudo -u bob pip install x',
    'env FOO=1 python x', 'FOO=1 python x', 'nohup python x &', 'time python x', 'exec python x',
    'cat f | xargs python', 'xargs -I{} python {}', "ssh host 'python3 -V'", 'ssh -p 22 host python3 -V',
    "ssh host 'ls; pip install x'", 'bash -c "python3 x"', "sudo bash -c 'echo a && python x'",
    'python tools/bad/x.py', 'cat <<END >x\nhi\nEND\npython z',
    // F1
    'command python x', 'command -p python x', 'command -v python && python x',
    // F2/F11 heredoc
    'cat <<EOF\n$(python x)\nEOF', "bash <<'EOF'\npython x\nEOF", 'sh <<EOF\npip install x\nEOF',
    "cat <<'E' | bash\npython x\nE", "echo 'cat <<EOF'\npython x", 'echo "<<EOF"; python x',
    'echo $(( 1 << 2 )); python x', 'python x <<< foo',
    // F3
    'if true; then python x; fi', 'if python x; then echo; fi', 'while python x; do :; done',
    'true && { python x; }', '! python x', 'if a; then b; else python y; fi', 'for f in a; do python $f; done',
    'until python x; do sleep 1; done', 'time -p python x', 'if a; then b; elif python y; then c; fi',
    // F5
    'bash x.py', 'sh x.py', 'source x.py', '. ./x.py', 'bash -x x.py', 'bash tools/ok/../bad/x.py',
    // F6/F7/F9
    'python tools/ok/../bad/x.py', 'python tools/okay/x.py', 'python ../x.py', 'python /elsewhere/x.py',
    'python /proj/../x.py', 'python -W ignore -X dev x.py', 'python -c "print(1)"', 'python -m http.server',
    'python -Wignore -c x', 'python -Bm pytest', 'python tools/ok/$X.py', 'python tools/ok/*.py',
    // F4
    'uv run x', 'uv pip install x', 'uvx ruff', 'poetry run pytest', 'pipenv run x', 'conda run -n e x',
    'pyenv exec x', 'pypy3 x', 'ipython', 'jupyter notebook', 'env -S "python x"', 'env --split-string=python x',
    "env -S'python -V'", 'find . -name x -exec python {} \\;', 'find . -execdir pip install {} +', 'xargs -n1 python',
    'flock /tmp/l python x', 'flock /tmp/l -c "python x"', 'stdbuf -oL python x', 'watch -n 5 python x',
    'taskset -c 0 python x', 'taskset 0x1 python x', 'nice -n 5 python x', 'ionice -c 3 python x',
    'timeout 5 python x', 'timeout -s KILL 5 python x', 'ssh host -- python x', 'cmd /c python x',
    'cmd.exe /c "python x"', 'powershell -c "python x"', 'powershell -Command "python x"',
    'pwsh -NoProfile -Command python x', 'wsl python x', 'wsl -d Ubuntu -e python x', 'su -c "python x"',
    "su - bob -c 'pip install x'", 'python.bat x', 'py.exe x', `powershell -EncodedCommand ${b64}`,
    'pdm run x', 'sudo nice -n 1 timeout 5 python x',
    // обфускация/редиректы/PowerShell
    '2>/dev/null python x', 'python>out x', "$'pyth\\x6fn' x", 'pyth\\on x', 'Start-Process python x',
    '& python x', '& "C:\\Python312\\python.exe" x', 'C:\\Python312\\python.exe x', 'iex "python x"',
    'echo a |& python', 'cat < in.txt | python', '>out python x', 'FOO=1 BAR=2 python x',
  ];
  const neg = [
    'ls -la', 'grep -i python file', 'ps aux | grep python', 'apt-get install python3-certbot-nginx',
    'git commit -m "fix python hook; python3 pip"', 'rg pip src', 'ls pythonista/', 'cat pythonista/readme.md',
    'echo python', 'node x.mjs', 'pnpm install', 'git log --grep=python', "ssh host 'grep python log'",
    'ssh host ls', 'echo "a; python b"', "echo 'python x'", 'sudo apt-get install python3',
    'git commit -m "$(cat <<\'END\'\nuse python and pip here\npython x\nEND\n)"', 'cat requirements.pip',
    'python tools/ok/x.py', 'grep pip package.json',
    // F1
    'command -v python', 'command -V pip', 'type python', 'which python', 'hash python',
    'command -v python3 >/dev/null || echo no', 'if command -v python; then echo y; fi',
    // F2/F11
    'cat <<\'EOF\'\npython x\nEOF', 'cat <<EOF\nuse python\nEOF', "tee f <<'EOF'\npip install\nEOF",
    'gh pr create --body "$(cat <<\'EOF\'\npython x\nEOF\n)"', "git commit -F - <<'EOF'\npip install x\nEOF",
    'cat <<-EOF\n\tpython x\n\tEOF', 'cat <<EOF | tee f\npython\nEOF', 'cat <<EOF\n$(date)\nEOF',
    'echo $(( 1 << 2 ))', "cat > f <<'EOF'\nsubprocess python\nEOF\nls",
    // F6/F9
    'python -W ignore tools/ok/x.py', 'python -X dev -O tools/ok/sub/x.py', 'python /proj/tools/ok/x.py',
    'python ./tools/ok/x.py', 'python tools/ok/./x.py', 'bash tools/ok/x.py', '. ./tools/ok/x.py',
    'python -Wignore tools/ok/x.py',
    // F4 негативные соседи
    'uv sync', 'uv add requests', 'poetry install', "find . -name '*.py'", 'find . -exec ls {} \\;', 'xargs ls',
    'timeout 5 ls', 'nice ls', 'flock /tmp/l ls', 'watch ls', 'ssh host -- ls', 'cmd /c dir',
    'powershell -c "ls"', 'wsl ls', 'su -c "ls"', 'env -S "ls -l"', 'env FOO=1 ls', 'taskset -c 0 ls',
    'stdbuf -oL ls', 'jupytext --version', 'pypyfoo x',
    // прочее
    'cat x.py', 'git add foo.py', 'grep -r pythonpath .', 'if true; then echo python; fi',
    'for p in python pip; do echo $p; done', 'echo then python', 'ls 2>&1 | grep python', 'ls >python.log',
    'ls > python', 'Start-Process notepad', 'echo pip', 'pnpm exec playwright', "echo 'x' # python",
    'source ./.env.example', 'echo "pip install" | cat', 'ls &>python.log',
  ];
  let pp = 0;
  let np = 0;
  const fails = [];
  for (const c of pos) {
    let r;
    try { r = check(c, allow); } catch (e) { r = 'EXC ' + e.message; }
    r === true ? pp++ : fails.push('POS miss: ' + JSON.stringify(c) + ' -> ' + r);
  }
  for (const c of neg) {
    let r;
    try { r = check(c, allow); } catch (e) { r = 'EXC ' + e.message; }
    r === false ? np++ : fails.push('NEG false-block: ' + JSON.stringify(c) + ' -> ' + r);
  }
  const typical = 'git status --short --branch && pnpm --filter web test -- --run "a b" | tee out.log';
  const t0 = process.hrtime.bigint();
  for (let k = 0; k < 500; k++) check(typical, allow);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 500;
  console.log(`positive ${pp}/${pos.length}, negative ${np}/${neg.length}, typical check ${ms.toFixed(3)} ms`);
  for (const f of fails) console.log(f);
  process.exit(fails.length ? 1 : 0);
}

function main() {
  if (process.argv.includes('--selftest')) return selftest();
  let command;
  try {
    const data = JSON.parse(fs.readFileSync(0, 'utf8'));
    command = data?.tool_input?.command;
  } catch (e) {
    process.stderr.write(`deny-python: не удалось разобрать stdin (${e.message}); пропуск\n`);
    process.exit(0);
  }
  let blocked = false;
  try {
    blocked = typeof command === 'string' && check(command);
  } catch (e) {
    process.stderr.write(`deny-python: внутренняя ошибка (${e.message}); пропуск\n`);
    process.exit(0);
  }
  if (blocked) {
    process.stderr.write(MESSAGE + '\n');
    process.exit(2);
  }
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
