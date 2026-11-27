// Общая маска секретов для smoke.mjs и visual-check.mjs (одна реализация, без дублирования).
// ЛЮБОЙ вывод (console.*, необработанные ошибки, results.json) проходит через mask(). Слои:
//   1) литеральные значения, зарегистрированные addSecret() (пароли, TOTP-секрет, токены) - в исходном, JSON-экранированном и URL-кодированном виде;
//   2) заголовки Cookie / Set-Cookie / Authorization / Proxy-Authorization: вся остальная строка (любая схема: Bearer, Basic, Digest, свой формат);
//   3) пары «имя значение» с именем, содержащим cookie|auth|pass|secret|token|key|otp|backup (без учёта регистра): JSON ("k":"v", "k":123456),
//      JSON внутри строки (\"k\":\"v\"), k=v, YAML (k: v), значения в кавычках (в т.ч. с экранированными кавычками) и без кавычек, числа (otp 123456);
//   4) JWT, Bearer/Basic/Digest/Negotiate/NTLM <токен>, пароль в URL (схема://user:пароль@), otpauth://.
// Маска намеренно агрессивная: лучше скрыть лишнее, чем показать секрет. Самопроверка без сети: SMOKE_SELFTEST_MASK=1 node smoke.mjs | visual-check.mjs.
// Файл ДОЛЖЕН лежать рядом со скриптами (run-smoke.sh/run-visual.sh везут его вместе, smoke.sh/visual-check.sh монтируют в /s/mask.mjs).

const SECRET_VALUES = new Set();

export const addSecret = (v, minLen = 4) => {
  if (typeof v !== 'string' || v.length < minLen) return;
  SECRET_VALUES.add(v);
  SECRET_VALUES.add(JSON.stringify(v).slice(1, -1));
  SECRET_VALUES.add(encodeURIComponent(v));
};

const KEYS = 'cookie|auth|pass|secret|token|key|otp|backup';
// значение: "..." / '...' / \"...\" (JSON внутри строки) / без кавычек (до пробела, &, запятой, ;, закрывающей скобки)
const VALUE = String.raw`\[[^\]]*\]|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\\"(?:(?!\\").)*\\"|[^\s&,;"'}\])]+`;
const PAIR = new RegExp(String.raw`(?<![\w.-])(\\?["']?[\w.-]*(?:${KEYS})[\w.-]*\\?["']?\s*[=:]\s*)(${VALUE})`, 'gi');
const HEADER = /((?:Proxy-Authorization|Authorization|Set-Cookie|Cookie)\s*:[ \t]*)[^\r\n]*/gi;

const keepQuotes = (_m, head, val) => {
  if (val.startsWith('[')) return `${head}[***]`;
  if (val.startsWith('\\"')) return `${head}\\"***\\"`;
  if (val.startsWith('"')) return `${head}"***"`;
  if (val.startsWith("'")) return `${head}'***'`;
  return `${head}***`;
};

export const mask = (s) => {
  let t = String(s);
  for (const v of [...SECRET_VALUES].sort((a, b) => b.length - a.length)) t = t.split(v).join('***');
  return t
    .replace(HEADER, '$1***')
    .replace(PAIR, keepQuotes)
    .replace(/\b((?:t?otp|2fa|backup)[\w -]{0,15}?[:=\s]\s*)\d{4,10}\b/gi, '$1***') // «otp 123456», «OTP code: 123456»: имя и число без разделителя пары
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '***jwt***')
    .replace(/\b(Bearer|Basic|Digest|Negotiate|NTLM)\s+[^\s"',;]+/gi, '$1 ***')
    .replace(/(:\/\/[^\s:@/]+:)[^\s@/]+@/g, '$1***@')
    .replace(/otpauth:\/\/\S+/gi, 'otpauth://***');
};

export const show = (x) => (typeof x === 'string' ? x : x instanceof Error ? (x.stack ?? x.message) : JSON.stringify(x));

// console.* и необработанные ошибки - только через mask()
export const installMask = () => {
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
};

// Самопроверка: возвращает код выхода (0 - ok). Все значения собраны из частей, чтобы в репозитории не было похожих на пароли литералов.
export const runMaskSelftest = () => {
  const fake = ['fake-' + 'pw-value-1', 'fake-' + 'totp-value-2', 'fake-' + 'backup-value-3', 'fa ke&' + 'pw/4'];
  fake.forEach(addSecret);
  const u = (n) => 'zz' + 'unknown-' + n; // значения, которых нет в SECRET_VALUES: маска обязана сработать по ИМЕНИ
  const leakProbes = [
    `пароль ${fake[0]}`,
    `totp=${fake[1]} backup=${fake[2]}`,
    new Error(`boom ${fake[0]}`),
    `json-escaped ${JSON.stringify(fake[3])} url-encoded ${encodeURIComponent(fake[3])}`,
    'Authorization: Bearer abc.def.ghi',
    'jwt ' + ['eyJhbGci' + 'OiJIUzI1NiJ9', 'eyJzdWIi' + 'OiIxIn0', 'sig'].join('.'),
    'postgresql://user:' + 'hunter2'.repeat(2) + '@db:5432/x',
    'otpauth://totp/x?secret=' + 'JBSWY3DP' + 'EHPK3PXP',
    `{"password":"${u(1)}","login":"x"}`,
    `password=${u(2)}&x=1`,
    `Authorization: Basic ${'QUJD' + 'REVGR0g='}`,
    `{"userPassword":"${u(3)}","apiKey":"${u(4)}","OTP_Code":"${u(5)}"}`,
    `refresh_token=${u(6)}&Api-Key=${u(7)}`,
    // заголовки: любая схема и строки Cookie
    `Authorization: ${'Custom-Scheme ' + u(8)}`,
    `authorization: ${u(9)}`,
    `Cookie: sid=${u(10)}; theme=dark`,
    `Set-Cookie: refresh=${u(11)}; HttpOnly; Path=/`,
    `Proxy-Authorization: Negotiate ${u(12)}`,
    // значения без кавычек, YAML, экранированные кавычки, числа
    `{"secret": ${u(13)}}`,
    `password: ${u(14)}`,
    `  otp_secret:   ${u(15)}`,
    `backupCode = ${u(16)}`,
    `{"password":"${u(17)}\\"${u(18)}"}`,
    `{"msg":"{\\"password\\":\\"${u(19)}\\",\\"x\\":1}"}`,
    'otp: ' + '123' + '456',
    `{"otp":${"123" + "456"}}`,
    `otp=${'654' + '321'}`,
    `'token': '${u(20)}'`,
    `x-api-key: ${u(21)}`,
    `db.backup_token=${u(22)}`,
    // массивы и числовые значения (числа собраны из частей, чтобы не было литералов)
    `{"backupCodes":["${u(23)}","${u(24)}"]}`,
    `password: ${'1234' + '5678'}`,
    `{"token": ${'9876' + '54321'}}`,
    `Cookie: ${'42' + '4242'}`,
    `api_key=${'0.5' + 'e3'}`,
    `{"passwordHash":-${'7' + '7777'}}`,
    `totp_code=${'000' + '123'}`,
    `{"codes":{"otp":${'777' + '888'}}}`,
    `pass:\t${'9988' + '7766'} # note`,
    'otp ' + '246' + '810',
    'OTP code: ' + '135' + '791',
  ];
  const leaked = leakProbes
    .map((p) => mask(show(p)))
    .filter(
      (o) =>
        fake.some((f) => o.includes(f)) ||
        o.includes(encodeURIComponent(fake[3])) ||
        /unknown-|hunter2|eyJhbGci|abc.def|JBSWY|QUJDREVG|123456|654321|12345678|987654321|424242|0.5e3|77777|000123|777888|99887766|246810|135791/.test(o),
    );
  // Негативные пробы: обычный вывод проверок не должен искажаться
  const keep = ['РАБОТАЕТ | главная | 200 за 12 мс', 'ИТОГО: 20/20 работает, 0 нет', 'player 390 /shop -> 200 hscroll=false small=0 console=0'];
  const damaged = keep.filter((k) => mask(k) !== k);
  // Результат маски остаётся валидным JSON для JSON с кавычками
  const jsonOk = (() => {
    try {
      JSON.parse(mask(JSON.stringify({ password: u(30), nested: { apiKey: u(31) }, n: 1 }, null, 2)));
      return true;
    } catch {
      return false;
    }
  })();
  const bad = leaked.length + damaged.length + (jsonOk ? 0 : 1);
  console.log(
    bad
      ? `mask-selftest: УТЕЧКА ${leaked.length}, искажено ${damaged.length}, json ${jsonOk ? 'ok' : 'сломан'}`
      : `mask-selftest: ok (${leakProbes.length} проб утечки, ${keep.length} негативных, json)`,
  );
  if (bad) leaked.forEach((o) => console.log('  утечка:', o.slice(0, 120)));
  return bad ? 1 : 0;
};
