import { MAX_PROGRESS_UUIDS } from './giveaway.constants';

/// Строгий разбор тел подписанных вызовов фазы 2 (ADR-G002 п. 6).

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME_RE = /^[A-Za-z0-9_]{1,16}$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function hasOnlyKeys(o: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(o).every((k) => keys.includes(k));
}

export interface RedeemBody {
  /// Сырой ввод игрока; формат проверяется позже (единый invalid_code).
  code: string;
  playerUuid: string;
  playerName: string;
}

/// Тело `POST /redeem`: ровно три поля.
export function parseRedeemBody(body: unknown): RedeemBody | null {
  if (!isPlainObject(body)) return null;
  if (!hasOnlyKeys(body, ['code', 'playerUuid', 'playerName'])) return null;
  const { code, playerUuid, playerName } = body;
  if (typeof code !== 'string' || code.length > 64) return null;
  if (typeof playerUuid !== 'string' || !UUID_RE.test(playerUuid)) return null;
  if (typeof playerName !== 'string' || !NAME_RE.test(playerName)) return null;
  return { code, playerUuid: playerUuid.toLowerCase(), playerName };
}

/// Тело `POST /progress`: `{ uuids: [1..100] }`.
export function parseProgressBody(body: unknown): string[] | null {
  if (!isPlainObject(body) || !hasOnlyKeys(body, ['uuids'])) return null;
  const uuids = body.uuids;
  if (
    !Array.isArray(uuids) ||
    uuids.length < 1 ||
    uuids.length > MAX_PROGRESS_UUIDS
  ) {
    return null;
  }
  const out = new Set<string>();
  for (const u of uuids) {
    if (typeof u !== 'string' || !UUID_RE.test(u)) return null;
    out.add(u.toLowerCase());
  }
  return [...out];
}

/// Тело `POST /codes`: пусто или `{ captchaToken?: string }`.
export function parseCodesBody(body: unknown): string | undefined | null {
  if (body === undefined || body === null) return undefined;
  if (!isPlainObject(body)) return null;
  if (!hasOnlyKeys(body, ['captchaToken'])) return null;
  const t = body.captchaToken;
  if (t === undefined) return undefined;
  if (typeof t !== 'string' || t.length > 4096) return null;
  return t;
}
