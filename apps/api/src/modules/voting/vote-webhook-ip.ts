import { isIP } from 'net';

/// IPv4-mapped IPv6 (`::ffff:a.b.c.d`) приводится к `a.b.c.d`: Node/Express
/// отдаёт req.ip в таком виде на dual-stack сокете. Регистр IPv6 понижается.
export function normalizeIp(value: string): string {
  const v = value.trim();
  const m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(v);
  if (m && isIP(m[1]) === 4) return m[1];
  return isIP(v) === 6 ? v.toLowerCase() : v;
}

/// Разбор VOTING_WEBHOOK_ALLOWED_IPS: список точных IP через запятую.
/// Возвращает нормализованные адреса и список некорректных элементов.
export function parseAllowedIps(raw: string): {
  ips: string[];
  invalid: string[];
} {
  const ips: string[] = [];
  const invalid: string[] = [];
  for (const item of raw.split(',')) {
    const t = item.trim();
    if (t === '') continue;
    if (isIP(t) === 0 && !/^::ffff:\d{1,3}(?:\.\d{1,3}){3}$/i.test(t)) {
      invalid.push(t);
      continue;
    }
    const n = normalizeIp(t);
    if (isIP(n) === 0) invalid.push(t);
    else ips.push(n);
  }
  return { ips, invalid };
}
