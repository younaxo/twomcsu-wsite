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
/// добавлен; IPv6 не агрегируется по /64 (отдельный тикет).
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
