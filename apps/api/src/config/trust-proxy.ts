import { createHash } from 'crypto';
import { isIP } from 'net';

/// Политика доверия к прокси (ADR-0155, P3-02). Express использует
/// `X-Forwarded-For` для `req.ip` ТОЛЬКО от доверенных hop-ов: иначе клиент
/// подделал бы свой IP, а при полном отсутствии доверия за reverse proxy все
/// клиенты получают один IP (общий brute-force/throttle).
///
/// Допустимые значения TRUST_PROXY:
///  - пусто — прокси не доверяем (`false`), `req.ip` = адрес TCP-соединения;
///  - целое >= 1 — число доверенных hop-ов (1 для nginx → api);
///  - `loopback` | `linklocal` | `uniquelocal`;
///  - список IP/CIDR и этих имён через запятую.
/// CIDR шире IPv4 /8 и IPv6 /16 (в т.ч. 0.0.0.0/0, ::/0) отвергаются.
/// `true`, `*`, `-1`, `0` и мусор отвергаются: «доверять всем» позволяет
/// подделать IP любым заголовком.
export type TrustProxySetting = false | number | string[];

const NAMED = new Set(['loopback', 'linklocal', 'uniquelocal']);
const MAX_HOPS = 10;
/// Минимальная длина префикса CIDR: IPv4 >= /8, IPv6 >= /16.
const MIN_PREFIX_V4 = 8;
const MIN_PREFIX_V6 = 16;

function validEntry(entry: string): boolean {
  if (NAMED.has(entry)) return true;
  const [addr, prefix, ...rest] = entry.split('/');
  if (rest.length > 0) return false;
  const version = isIP(addr);
  if (version === 0) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  const bits = Number(prefix);
  // Слишком широкие префиксы (в т.ч. 0.0.0.0/0 и ::/0) = «доверять всем».
  if (bits < (version === 4 ? MIN_PREFIX_V4 : MIN_PREFIX_V6)) return false;
  return bits <= (version === 4 ? 32 : 128);
}

export function resolveTrustProxy(
  raw: string | undefined | null,
): TrustProxySetting {
  const value = (raw ?? '').trim();
  if (value === '') return false;

  if (/^-?\d+$/.test(value)) {
    const hops = Number(value);
    if (hops < 1 || hops > MAX_HOPS) {
      throw new Error(
        `TRUST_PROXY: число hop-ов должно быть от 1 до ${MAX_HOPS} (получено ${value}); для отключения оставьте пустым`,
      );
    }
    return hops;
  }

  const entries = value.split(',').map((e) => e.trim().toLowerCase());
  const bad = entries.find((e) => !validEntry(e));
  if (bad !== undefined) {
    throw new Error(
      `TRUST_PROXY: недопустимое значение "${bad}". Разрешено: пусто, число hop-ов (1), loopback/linklocal/uniquelocal или список IP/CIDR через запятую; "true", "*" и "-1" запрещены (подделка IP)`,
    );
  }
  return entries;
}

/// Приводит адрес клиента к единому виду: `::ffff:1.2.3.4` и `::ffff:102:304`
/// → `1.2.3.4`; IPv6 — в нижний регистр, zone id (`%eth0`) срезается. Нужен,
/// чтобы одна машина не получала два счётчика brute-force и чтобы в БД/audit
/// не попадала «mapped» форма. Не-IP значение (мусор, слишком длинная строка)
/// даёт ключ `unknown`.
/// Известный остаточный риск (ADR-0155): все клиенты без распознанного IP
/// делят один ключ `unknown` (общий счётчик), Logger.warn намеренно не
/// добавлен; IPv6 по /64 агрегирует `rateLimitKey` (ADR-0163); normalizeIp остаётся полным адресом.
const MAX_IP_LENGTH = 64;

export function normalizeIp(ip: string | undefined | null): string {
  let value = (ip ?? '').trim().toLowerCase();
  if (value === '' || value.length > MAX_IP_LENGTH) return 'unknown';
  const zone = value.indexOf('%');
  if (zone !== -1) value = value.slice(0, zone);
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (dotted && isIP(dotted[1]) === 4) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(value);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return isIP(value) === 0 ? 'unknown' : value;
}

/// Разворачивает валидный IPv6 (без zone id, нижний регистр) в 8 хекстетов
/// (числа 0..65535). Встроенный IPv4-хвост (`64:ff9b::1.2.3.4`) превращается в
/// два хекстета. Возвращает null, если адрес не разобрался.
function expandIpv6(value: string): number[] | null {
  let text = value;
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (tail) {
    if (isIP(tail[1]) !== 4) return null;
    const [a, b, c, d] = tail[1].split('.').map(Number);
    text =
      text.slice(0, tail.index) +
      `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string): number[] | null => {
    if (part === '') return [];
    const groups = part.split(':');
    if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
    return groups.map((g) => parseInt(g, 16));
  };
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  if (!head || !rest) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const fill = 8 - head.length - rest.length;
  if (fill < 1) return null;
  return [...head, ...new Array<number>(fill).fill(0), ...rest];
}

function rawKey(value: string): string {
  return `raw:${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
}

/// Ключ для лимитов входа/brute-force (ADR-0163, ответ владельца на Q9).
/// ТОЛЬКО для счётчиков и блокировок: журналы, аудит, lastLoginIp, согласия и
/// captcha.verify продолжают использовать полный адрес (`normalizeIp`).
///  - IPv4 и IPv4-mapped IPv6 — как `normalizeIp` (`1.2.3.4`);
///  - IPv6 — префикс /64: первые 4 хекстета без ведущих нулей, нижний
///    регистр, zone id срезан: `v6:2001:db8:0:1`;
///  - пусто/undefined — `unknown` (как `normalizeIp`);
///  - мусор (непустая не-IP строка, в т.ч. длинная) — `raw:` + первые 16 hex
///    sha256 от строки в нижнем регистре: не бросает, у разных строк разные
///    ключи, длина ключа ограничена, мусор не делит общий ключ `unknown`.
export function rateLimitKey(ip: string | undefined | null): string {
  const normalized = normalizeIp(ip);
  if (normalized === 'unknown') {
    const raw = (ip ?? '').trim().toLowerCase();
    return raw === '' ? 'unknown' : rawKey(raw);
  }
  if (isIP(normalized) !== 6) return normalized;
  const groups = expandIpv6(normalized);
  if (!groups) return rawKey(normalized);
  return `v6:${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(':')}`;
}
