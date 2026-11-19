import { PLAYER_NAME_PATTERN } from './giveaway.constants';
import { GiveawayMode } from './giveaway-data.service';
import { badRequest } from './giveaway-errors';
import { GiveawaySettingsPatch } from './giveaway-settings.service';
import { PrizeInput } from './giveaway-prizes.service';

/// Строгий разбор тел и параметров админ-API (ADR-G003 п. 5). Любая ошибка -
/// `400 {"error":"invalid_body"}` без деталей.

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

function invalid(): never {
  throw badRequest('invalid_body');
}

function obj(body: unknown, keys: string[], allowEmpty = false) {
  if (body === undefined || body === null) {
    if (allowEmpty) return {} as Record<string, unknown>;
    return invalid();
  }
  if (typeof body !== 'object' || Array.isArray(body)) return invalid();
  const o = body as Record<string, unknown>;
  if (!Object.keys(o).every((k) => keys.includes(k))) return invalid();
  return o;
}

function int(v: unknown, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    return invalid();
  }
  return v;
}

function isoDate(v: unknown): Date {
  if (typeof v !== 'string' || !ISO_UTC_RE.test(v)) return invalid();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? invalid() : d;
}

function text(v: unknown, min: number, max: number): string {
  if (typeof v !== 'string') return invalid();
  const t = v.trim();
  if (t.length < min || t.length > max || CONTROL_RE.test(t)) return invalid();
  return t;
}

export function parseMode(raw: unknown): GiveawayMode {
  if (raw === undefined) return 'live';
  if (raw === 'live' || raw === 'test') return raw;
  return invalid();
}

export function parsePage(
  rawPage: unknown,
  rawSize: unknown,
): { page: number; pageSize: number } {
  const toNum = (v: unknown, d: number): number => {
    if (v === undefined) return d;
    if (typeof v !== 'string' || !/^\d{1,6}$/.test(v)) return invalid();
    return Number(v);
  };
  const page = toNum(rawPage, 1);
  const pageSize = toNum(rawSize, 25);
  if (page < 1 || pageSize < 1 || pageSize > 100) return invalid();
  return { page, pageSize };
}

export function parseQuery(raw: unknown): string {
  if (raw === undefined) return '';
  if (typeof raw !== 'string' || raw.length > 32 || CONTROL_RE.test(raw)) {
    return invalid();
  }
  return raw;
}

export function parseUuid(raw: unknown): string {
  if (typeof raw !== 'string' || !UUID_RE.test(raw)) return invalid();
  return raw.toLowerCase();
}

export function parseSettingsPatch(body: unknown): GiveawaySettingsPatch {
  const o = obj(body, ['thresholdMinutes', 'startAt', 'cutoffAt']);
  const patch: GiveawaySettingsPatch = {};
  if (o.thresholdMinutes !== undefined) {
    patch.thresholdMinutes = int(o.thresholdMinutes, 1, 1_000_000);
  }
  if (o.startAt !== undefined) patch.startAt = isoDate(o.startAt);
  if (o.cutoffAt !== undefined) patch.cutoffAt = isoDate(o.cutoffAt);
  if (Object.keys(patch).length === 0) return invalid();
  return patch;
}

function prizeFields(o: Record<string, unknown>): PrizeInput {
  const out: PrizeInput = {};
  if (o.name !== undefined) out.name = text(o.name, 1, 80);
  if (o.quantity !== undefined) out.quantity = int(o.quantity, 1, 100);
  if (o.imageFile !== undefined) {
    if (o.imageFile !== null && typeof o.imageFile !== 'string')
      return invalid();
    out.imageFile = o.imageFile;
  }
  if (o.priority !== undefined)
    out.priority = int(o.priority, -1_000_000, 1_000_000);
  return out;
}

export function parsePrizeCreate(body: unknown): PrizeInput {
  const o = obj(body, ['name', 'quantity', 'imageFile', 'priority']);
  if (o.name === undefined || o.quantity === undefined) return invalid();
  return prizeFields(o);
}

export function parsePrizeUpdate(body: unknown): PrizeInput {
  const o = obj(body, ['name', 'quantity', 'imageFile', 'priority']);
  const out = prizeFields(o);
  if (Object.keys(out).length === 0) return invalid();
  return out;
}

export function parseCalculate(body: unknown): {
  snapshotHash: string;
  confirm: string;
} {
  const o = obj(body, ['snapshotHash', 'confirm']);
  if (typeof o.snapshotHash !== 'string' || typeof o.confirm !== 'string') {
    return invalid();
  }
  return { snapshotHash: o.snapshotHash, confirm: o.confirm };
}

export function parseDisqualify(body: unknown): string {
  const o = obj(body, ['reason']);
  return text(o.reason, 3, 300);
}

export function parseEmpty(body: unknown): void {
  obj(body, [], true);
}

function name(v: unknown): string {
  if (typeof v !== 'string' || !PLAYER_NAME_PATTERN.test(v)) return invalid();
  return v;
}

export function parseTestTime(body: unknown): {
  playerName: string;
  minutes: number;
  day?: string;
} {
  const o = obj(body, ['playerName', 'minutes', 'day']);
  const out: { playerName: string; minutes: number; day?: string } = {
    playerName: name(o.playerName),
    minutes: int(o.minutes, 1, 100_000),
  };
  if (o.day !== undefined) {
    if (typeof o.day !== 'string' || !DAY_RE.test(o.day)) return invalid();
    if (Number.isNaN(new Date(`${o.day}T00:00:00Z`).getTime()))
      return invalid();
    out.day = o.day;
  }
  return out;
}

export function parseTestTicket(body: unknown): string {
  return name(obj(body, ['playerName']).playerName);
}

export function parseTestSeed(body: unknown): number {
  return int(obj(body, ['count']).count, 1, 500);
}
