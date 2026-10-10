import { isIP } from 'net';

/// Защита от SSRF (ADR-0102): к каким адресам серверу TwoMC можно
/// подключаться, когда он сам ходит по ссылке пользователя. Только публичные
/// адреса интернета — никаких loopback, частных сетей, link-local (в т.ч.
/// метаданные облака 169.254.169.254), CGNAT, multicast, зарезервированных и
/// тестовых диапазонов, IPv6 ULA / link-local и IPv4-mapped вариантов.

const V4_BLOCKED: Array<[string, number]> = [
  ['0.0.0.0', 8], // «эта сеть»
  ['10.0.0.0', 8], // частная
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, метаданные облака
  ['172.16.0.0', 12], // частная
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // частная
  ['198.18.0.0', 15], // бенчмарки (в т.ч. fake-IP прокси)
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // зарезервировано, broadcast
];

function v4ToInt(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function v4Blocked(address: string): boolean {
  const ip = v4ToInt(address);
  if (ip === null) return true;
  return V4_BLOCKED.some(([base, bits]) => {
    const start = v4ToInt(base)!;
    const size = 2 ** (32 - bits);
    return ip >= start && ip < start + size;
  });
}

/// Развернуть IPv6 в 8 групп по 16 бит.
function v6Groups(address: string): number[] | null {
  let text = address.toLowerCase();
  const zone = text.indexOf('%');
  if (zone >= 0) text = text.slice(0, zone);
  // Хвост в виде IPv4 (::ffff:1.2.3.4).
  const v4Tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (v4Tail) {
    const ip = v4ToInt(v4Tail[1]!);
    if (ip === null) return null;
    text = `${text.slice(0, -v4Tail[1]!.length)}${(ip >>> 16).toString(16)}:${(ip & 0xffff).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (missing < 0) return null;
  const groups = [
    ...head,
    ...Array<string>(halves.length === 2 ? missing : 0).fill('0'),
    ...tail,
  ];
  if (groups.length !== 8) return null;
  const values = groups.map((group) =>
    /^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : NaN,
  );
  return values.some(Number.isNaN) ? null : values;
}

function v6Blocked(address: string): boolean {
  const g = v6Groups(address);
  if (!g) return true;
  const [a, b, c, d, e, f, gg, h] = g as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const zeroPrefix = a === 0 && b === 0 && c === 0 && d === 0 && e === 0;
  // :: и ::1
  if (zeroPrefix && f === 0 && gg === 0 && (h === 0 || h === 1)) return true;
  // IPv4-mapped (::ffff:a.b.c.d) и IPv4-compatible (::a.b.c.d) — по правилам IPv4.
  if (zeroPrefix && (f === 0xffff || f === 0)) {
    const v4 = `${gg >> 8}.${gg & 0xff}.${h >> 8}.${h & 0xff}`;
    return v4Blocked(v4);
  }
  // NAT64 64:ff9b::/96 — по встроенному IPv4.
  if (a === 0x64 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0) {
    return v4Blocked(`${gg >> 8}.${gg & 0xff}.${h >> 8}.${h & 0xff}`);
  }
  if ((a & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  if ((a & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((a & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (устар.)
  if ((a & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (a === 0x2001 && b === 0x0db8) return true; // 2001:db8::/32 документация
  if (a === 0x2002) return true; // 6to4 — может указывать на частный IPv4
  if (a === 0x2001 && b === 0) return true; // Teredo
  if (a === 0x0100 && b === 0 && c === 0 && d === 0) return true; // discard-only
  return false;
}

/// true — адрес публичный, к нему можно подключаться.
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !v4Blocked(address);
  if (family === 6) return !v6Blocked(address);
  return false;
}
