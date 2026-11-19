import { GIVEAWAY_SCHEMA, MAX_EVENTS_PER_BATCH } from './giveaway.constants';

export type GiveawayEventType = 'join' | 'quit' | 'heartbeat';

export interface GiveawayEvent {
  eventId: string;
  type: GiveawayEventType;
  /// Нижний регистр, с дефисами.
  playerUuid: string;
  playerName: string;
  occurredAt: Date;
  /// Только у heartbeat.
  active: boolean | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME_RE = /^[A-Za-z0-9_]{1,16}$/;
/// UTC, строго `YYYY-MM-DDTHH:MM:SS(.sss)Z`.
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const TYPES = new Set(['join', 'quit', 'heartbeat']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function hasOnlyKeys(o: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(o).every((k) => keys.includes(k));
}

function parseEvent(raw: unknown): GiveawayEvent | null {
  if (!isPlainObject(raw)) return null;
  const { eventId, type, playerUuid, playerName, occurredAt, active } = raw;
  if (typeof eventId !== 'string' || !UUID_RE.test(eventId)) return null;
  if (typeof type !== 'string' || !TYPES.has(type)) return null;
  const allowed = ['eventId', 'type', 'playerUuid', 'playerName', 'occurredAt'];
  if (type === 'heartbeat') {
    allowed.push('active');
    if (typeof active !== 'boolean') return null;
  } else if (active !== undefined) {
    return null;
  }
  if (!hasOnlyKeys(raw, allowed)) return null;
  if (typeof playerUuid !== 'string' || !UUID_RE.test(playerUuid)) return null;
  if (typeof playerName !== 'string' || !NAME_RE.test(playerName)) return null;
  if (typeof occurredAt !== 'string' || !ISO_UTC_RE.test(occurredAt)) {
    return null;
  }
  const at = new Date(occurredAt);
  if (Number.isNaN(at.getTime())) return null;
  return {
    eventId: eventId.toLowerCase(),
    type: type as GiveawayEventType,
    playerUuid: playerUuid.toLowerCase(),
    playerName,
    occurredAt: at,
    active: type === 'heartbeat' ? (active as boolean) : null,
  };
}

/// Строгий разбор конверта `{ schema, events: [...] }`: любая ошибка схемы
/// (лишнее поле, неверный тип, более 100 событий, пустой пакет) отклоняет
/// весь пакет (null). Отклонение событий по времени - в сервисе приёма.
export function parseEnvelope(body: unknown): GiveawayEvent[] | null {
  if (!isPlainObject(body)) return null;
  if (!hasOnlyKeys(body, ['schema', 'events'])) return null;
  if (body.schema !== GIVEAWAY_SCHEMA) return null;
  const events = body.events;
  if (!Array.isArray(events)) return null;
  if (events.length < 1 || events.length > MAX_EVENTS_PER_BATCH) return null;
  const out: GiveawayEvent[] = [];
  for (const e of events) {
    const p = parseEvent(e);
    if (p === null) return null;
    out.push(p);
  }
  return out;
}
