#!/usr/bin/env node
// PreToolUse-хук (matcher Bash): запрещает запуск Python/pip в позиции команды.
// Вход: JSON в stdin ({tool_input:{command}}). Отказ: exit 2 + сообщение в stderr.
// Ограничение: статический разбор строки; обход через base64/eval/переменные не ловится.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MESSAGE = 'Python запрещён, используй node/bash';
const here = path.dirname(fileURLToPath(import.meta.url));

function normPath(p) {
  return p.replace(/\\/g, '/').replace(/^(\.\/)+/, '');
}

function loadAllow() {
  try {
    return fs
      .readFileSync(path.join(here, 'python-allow.txt'), 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map(normPath);
  } catch {
    return [];
  }
}

const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);
const WRAP_NOARG = new Set(['nohup', 'time', 'exec', 'command', 'builtin', 'setsid']);

function base(w) {
  return w.split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/, '');
}
const isInterp = (b) => /^python(w)?(\d+(\.\d+)*)?$/.test(b) || b === 'py';
const isPip = (b) => /^pip(\d+(\.\d+)*)?$/.test(b) || b === 'pipx';

// Удаление тел heredoc (это данные, не команды).
function stripHeredocs(src) {
  const out = [];
  let delim = null;
  for (const line of src.split('\n')) {
    if (delim !== null) {
      if (line.trim() === delim) delim = null;
      continue;
    }
    out.push(line);
    const m = line.match(/<<-?\s*(?:'([^']+)'|"([^"]+)"|\\?([A-Za-z_]\w*))/);
    if (m) delim = m[1] || m[2] || m[3];
  }
  return out.join('\n');
}

// Возвращает сегменты (массивы слов) и вложенные подстановки из двойных кавычек.
function scan(src) {
  const segments = [];
  const subs = [];
  let words = [];
  let cur = '';
  let has = false;
  const endWord = () => {
    if (has) words.push(cur);
    cur = '';
    has = false;
  };
  const endSeg = () => {
    endWord();
    if (words.length) segments.push(words);
    words = [];
  };
  const grab = (from, open, close) => {
    let depth = 1;
    let j = from;
    while (j < src.length && depth > 0) {
      if (src[j] === open && open !== close) depth++;
      else if (src[j] === close) depth--;
      j++;
    }
    subs.push(src.slice(from, depth === 0 ? j - 1 : j));
    return j;
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      cur += src[i + 1] ?? '';
      has = true;
      i += 2;
    } else if (c === "'") {
      const j = src.indexOf("'", i + 1);
      const end = j === -1 ? src.length : j;
      cur += src.slice(i + 1, end);
      has = true;
      i = end + 1;
    } else if (c === '"') {
      has = true;
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') {
          if ('$`"\\\n'.includes(src[i + 1] ?? 'x')) {
            cur += src[i + 1];
            i += 2;
          } else {
            cur += src[i++];
          }
        } else if (src[i] === '$' && src[i + 1] === '(') {
          i = grab(i + 2, '(', ')');
        } else if (src[i] === '`') {
          i = grab(i + 1, '`', '`');
        } else {
          cur += src[i++];
        }
      }
      i++;
    } else if (c === '$' && src[i + 1] === '(') {
      endSeg();
      i += 2;
    } else if (c === '`' || c === ';' || c === '&' || c === '|' || c === '(' || c === ')' || c === '\n') {
      endSeg();
      i++;
    } else if (c === ' ' || c === '\t' || c === '\r') {
      endWord();
      i++;
    } else {
      cur += c;
      has = true;
      i++;
    }
  }
  endSeg();
  return { segments, subs };
}

function firstArg(args) {
  return args.find((a) => !a.startsWith('-')) ?? null;
}

function allowed(file, allow) {
  if (!file) return false;
  const p = normPath(file);
  return /\.py$/i.test(p) && allow.some((pre) => p.startsWith(pre));
}

function skipOpts(ws, i, withArg) {
  while (i < ws.length && ws[i].startsWith('-')) i += withArg.has(ws[i]) ? 2 : 1;
  return i;
}

const SUDO_ARGS = new Set(['-u', '-g', '-h', '-p', '-C', '-D', '-R', '-T', '-U']);
const ENV_ARGS = new Set(['-u', '-C', '-S']);
const XARGS_ARGS = new Set(['-I', '-n', '-P', '-d', '-E', '-L', '-s', '-a']);
const SSH_ARGS = new Set(['-p', '-i', '-l', '-o', '-F', '-J', '-L', '-R', '-D', '-b', '-c', '-e', '-E', '-I', '-m', '-O', '-S', '-w', '-W', '-B']);

function checkSegment(ws, allow, depth) {
  let i = 0;
  while (i < ws.length) {
    const w = ws[i];
    const b = base(w);
    if (/^[A-Za-z_]\w*=/.test(w)) i++;
    else if (b === 'sudo' || b === 'doas') i = skipOpts(ws, i + 1, SUDO_ARGS);
    else if (b === 'env') i = skipOpts(ws, i + 1, ENV_ARGS);
    else if (b === 'nice') i = skipOpts(ws, i + 1, new Set(['-n']));
    else if (b === 'timeout') i = skipOpts(ws, i + 1, new Set(['-s', '-k'])) + 1;
    else if (b === 'xargs') i = skipOpts(ws, i + 1, XARGS_ARGS);
    else if (WRAP_NOARG.has(b)) i = skipOpts(ws, i + 1, new Set());
    else break;
  }
  if (i >= ws.length) return false;
  const cmd = ws[i];
  const b = base(cmd);
  const rest = ws.slice(i + 1);
  if (isPip(b)) return true;
  if (isInterp(b)) return !allowed(firstArg(rest), allow);
  if (/\.py$/i.test(cmd)) return !allowed(cmd, allow);
  if (SHELLS.has(b)) {
    const k = rest.findIndex((a) => /^-[a-z]*c[a-z]*$/.test(a));
    if (k !== -1 && rest[k + 1] !== undefined) return check(rest[k + 1], allow, depth + 1);
    return false;
  }
  if (b === 'eval') return check(rest.join(' '), allow, depth + 1);
  if (b === 'ssh') {
    const j = skipOpts(rest, 0, SSH_ARGS);
    return check(rest.slice(j + 1).join(' '), allow, depth + 1);
  }
  return false;
}

export function check(command, allow = loadAllow(), depth = 0) {
  if (depth > 6 || typeof command !== 'string') return false;
  const { segments, subs } = scan(stripHeredocs(command));
  for (const s of subs) if (check(s, allow, depth + 1)) return true;
  for (const seg of segments) if (checkSegment(seg, allow, depth)) return true;
  return false;
}

function selftest() {
  const allow = ['tools/ok/'];
  const pos = [
    'python --version',
    'python3 x.js',
    'python3.11 -V',
    'python.exe -V',
    '/usr/bin/python3 -V',
    '"C:\\Python312\\python.exe" -V',
    'py -3 script.py',
    'pip install requests',
    'pip3 install x',
    'pipx run foo',
    'python -m pip install x',
    './script.py',
    'scripts/run.py --flag',
    'ls && python3 x',
    'ls; python x',
    'false || python x',
    'echo hi | python -c "print(1)"',
    '(python x)',
    'echo $(python3 -V)',
    'echo `python -V`',
    'echo "$(python3 -V)"',
    'ls\npython x',
    'sudo python3 x',
    'sudo -u bob pip install x',
    'env FOO=1 python x',
    'FOO=1 python x',
    'nohup python x &',
    'time python x',
    'exec python x',
    'cat f | xargs python',
    'xargs -I{} python {}',
    "ssh host 'python3 -V'",
    'ssh -p 22 host python3 -V',
    "ssh host 'ls; pip install x'",
    'bash -c "python3 x"',
    "sudo bash -c 'echo a && python x'",
    'python tools/bad/x.py',
    'cat <<END >x\nhi\nEND\npython z',
  ];
  const neg = [
    'ls -la',
    'grep -i python file',
    'ps aux | grep python',
    'apt-get install python3-certbot-nginx',
    'git commit -m "fix python hook; python3 pip"',
    'rg pip src',
    'ls pythonista/',
    'cat pythonista/readme.md',
    'echo python',
    'node x.mjs',
    'pnpm install',
    'bash x.py',
    'git log --grep=python',
    "ssh host 'grep python log'",
    'ssh host ls',
    'echo "a; python b"',
    "echo 'python x'",
    'sudo apt-get install python3',
    'git commit -m "$(cat <<\'END\'\nuse python and pip here\npython x\nEND\n)"',
    'cat requirements.pip',
    'python tools/ok/x.py',
    'grep pip package.json',
  ];
  let pp = 0;
  let np = 0;
  const fails = [];
  for (const c of pos) check(c, allow) ? pp++ : fails.push('POS miss: ' + JSON.stringify(c));
  for (const c of neg) !check(c, allow) ? np++ : fails.push('NEG false-block: ' + JSON.stringify(c));
  console.log(`positive ${pp}/${pos.length}, negative ${np}/${neg.length}`);
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
  if (typeof command === 'string' && check(command)) {
    process.stderr.write(MESSAGE + '\n');
    process.exit(2);
  }
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
