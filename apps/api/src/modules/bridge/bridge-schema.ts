import {
  MAX_EVENTS_PER_BATCH,
  BRIDGE_SCHEMA,
  SLUG_PATTERN,
} from './bridge.constants';
import {
  computeRowHash,
  normalizeActor,
} from '../punishments/normalize-punishment';
import {
  NormalizedPunishment,
  PUNISHMENT_KINDS,
  PunishmentActor,
  PunishmentKind,
  PunishmentRemoval,
} from '../punishments/punishment.types';
import { sanitizeLabel, sanitizeReason } from '../punishments/text-sanitizer';

/// Строгие схемы Bridge v1 (раздел 4 контракта). Ошибка конверта - вся пачка
/// отклоняется (422); ошибка `data` - отклоняется только событие
/// (`invalid_data`).

class Invalid extends Error {}

function fail(): never {
  throw new Invalid();
}

export interface BridgeEventEnvelope {
  eventId: string;
  type: string;
  serverId: string;
  streamId: string;
  seq: number;
  occurredAt: Date;
  data: Record<string, unknown>;
}

export interface BridgeBatch {
  sentAt: Date;
  events: BridgeEventEnvelope[];
}

export type Parsed<T> = { ok: true; value: T } | { ok: false };

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const EVENT_ID = /^[A-Za-z0-9_-]{26,64}$/;
const EVENT_TYPE = /^[A-Za-z0-9._-]{1,48}$/;
const UUID =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SOURCE_ID = /^[1-9][0-9]{0,19}$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

/// Точное множество ключей: лишние отклоняются, обязательные должны быть.
function checkKeys(
  obj: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  for (const k of Object.keys(obj)) if (!allowed.has(k)) fail();
  for (const k of required) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) fail();
  }
}

function dateTime(v: unknown): Date {
  if (typeof v !== 'string' || !DATE_TIME.test(v)) fail();
  const d = new Date(v);
  if (Number.isNaN(d.getTime()) || d.toISOString() !== v) fail();
  return d;
}

function nullableDateTime(v: unknown): Date | null {
  return v === null || v === undefined ? null : dateTime(v);
}

function str(v: unknown, min: number, max: number): string {
  if (typeof v !== 'string' || v.length < min || v.length > max) fail();
  return v;
}

function nullableStr(v: unknown, max: number): string | null {
  return v === null || v === undefined ? null : str(v, 0, max);
}

function bool(v: unknown, dflt: boolean): boolean {
  if (v === undefined) return dflt;
  if (typeof v !== 'boolean') fail();
  return v;
}

function uuid(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' || !UUID.test(v)) fail();
  return v.toLowerCase();
}

/// Пачка (конверт): строгая, любое отклонение - `{ ok: false }` (422).
export function parseEnvelope(body: unknown): Parsed<BridgeBatch> {
  try {
    if (!isPlainObject(body)) fail();
    checkKeys(body, ['schema', 'sentAt', 'events']);
    if (body.schema !== BRIDGE_SCHEMA) fail();
    const sentAt = dateTime(body.sentAt);
    const rawEvents = body.events;
    if (
      !Array.isArray(rawEvents) ||
      rawEvents.length < 1 ||
      rawEvents.length > MAX_EVENTS_PER_BATCH
    ) {
      fail();
    }
    const events = (rawEvents as unknown[]).map((raw): BridgeEventEnvelope => {
      if (!isPlainObject(raw)) fail();
      checkKeys(raw, [
        'eventId',
        'type',
        'serverId',
        'streamId',
        'seq',
        'occurredAt',
        'data',
      ]);
      if (typeof raw.eventId !== 'string' || !EVENT_ID.test(raw.eventId)) {
        fail();
      }
      if (typeof raw.type !== 'string' || !EVENT_TYPE.test(raw.type)) fail();
      if (
        typeof raw.serverId !== 'string' ||
        !SLUG_PATTERN.test(raw.serverId)
      ) {
        fail();
      }
      if (
        typeof raw.seq !== 'number' ||
        !Number.isSafeInteger(raw.seq) ||
        raw.seq < 1
      ) {
        fail();
      }
      if (!isPlainObject(raw.data)) fail();
      return {
        eventId: raw.eventId,
        type: raw.type,
        serverId: raw.serverId,
        streamId: str(raw.streamId, 1, 64),
        seq: raw.seq,
        occurredAt: dateTime(raw.occurredAt),
        data: raw.data,
      };
    });
    return { ok: true, value: { sentAt, events } };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false };
    throw e;
  }
}

const KNOWN_PUNISHMENT_KEYS = [
  'kind',
  'sourceId',
  'subjectUuid',
  'subjectName',
  'ipBan',
  'reason',
  'executor',
  'startedAt',
  'until',
  'status',
  'removal',
  'scope',
  'origin',
  'silent',
  'template',
] as const;

function parseActor(v: unknown): PunishmentActor | null {
  if (v === null || v === undefined) return null;
  if (!isPlainObject(v)) fail();
  checkKeys(v, [], ['uuid', 'name', 'console']);
  const isConsole = bool(v.console, false);
  const u = uuid(v.uuid);
  const name = nullableStr(v.name, 32);
  if (isConsole) {
    if (u !== null || name !== null) fail();
    return { console: true };
  }
  return normalizeActor(u, name);
}

function parseKind(v: unknown): PunishmentKind {
  if (
    typeof v !== 'string' ||
    !(PUNISHMENT_KINDS as readonly string[]).includes(v)
  ) {
    fail();
  }
  return v as PunishmentKind;
}

export type PunishmentEventType =
  | 'punishment.created'
  | 'punishment.updated'
  | 'punishment.removed'
  | 'punishment.deleted';

export type ParsedPunishmentEvent =
  | { type: 'deleted'; kind: PunishmentKind; sourceId: string }
  | {
      type: 'created' | 'updated' | 'removed';
      punishment: NormalizedPunishment;
    };

/// `data` событий `punishment.*` (3.3 контракта). Лишние поля (в том числе
/// любые `ip`/адреса) отклоняются; `status` из `data` принимается и
/// ИГНОРИРУЕТСЯ: статус вычисляет приёмник по типу события, `until` и
/// `removal`. Для `punishment.deleted` допустимы только `kind`, `sourceId`
/// (и игнорируемый `status`). `nowMs` - время сайта для статуса по сроку.
export function parsePunishmentData(
  type: PunishmentEventType,
  data: Record<string, unknown>,
  occurredAt: Date,
  nowMs: number,
): Parsed<ParsedPunishmentEvent> {
  try {
    if (type === 'punishment.deleted') {
      checkKeys(data, ['kind', 'sourceId'], ['status']);
      const sourceId = data.sourceId;
      if (typeof sourceId !== 'string' || !SOURCE_ID.test(sourceId)) fail();
      return {
        ok: true,
        value: { type: 'deleted', kind: parseKind(data.kind), sourceId },
      };
    }
    checkKeys(
      data,
      ['kind', 'sourceId', 'startedAt'],
      KNOWN_PUNISHMENT_KEYS.filter(
        (k) => k !== 'kind' && k !== 'sourceId' && k !== 'startedAt',
      ),
    );
    const kind = parseKind(data.kind);
    const sourceId = data.sourceId;
    if (typeof sourceId !== 'string' || !SOURCE_ID.test(sourceId)) fail();
    const startedAt = dateTime(data.startedAt);
    const until = nullableDateTime(data.until);
    const eventType = type.slice('punishment.'.length) as
      'created' | 'updated' | 'removed';

    let removal: PunishmentRemoval | null = null;
    const rawRemoval = data.removal;
    if (rawRemoval !== null && rawRemoval !== undefined) {
      if (eventType !== 'removed') fail();
      if (!isPlainObject(rawRemoval)) fail();
      checkKeys(rawRemoval, [], ['by', 'reason', 'at']);
      removal = {
        by: parseActor(rawRemoval.by),
        reason: sanitizeReason(nullableStr(rawRemoval.reason, 2048)),
        at: nullableDateTime(rawRemoval.at),
      };
    }

    let status: NormalizedPunishment['status'];
    if (kind === 'KICK') status = 'EXPIRED';
    else if (eventType === 'removed') status = 'REMOVED';
    else if (until !== null && until.getTime() <= nowMs) status = 'EXPIRED';
    else status = 'ACTIVE';
    if (status === 'REMOVED') {
      removal = {
        by: removal?.by ?? null,
        reason: removal?.reason ?? null,
        at: removal?.at ?? occurredAt,
      };
    } else {
      removal = null;
    }

    const template = data.template;
    if (
      template !== undefined &&
      template !== null &&
      (typeof template !== 'number' ||
        !Number.isInteger(template) ||
        template < 0 ||
        template > 255)
    ) {
      fail();
    }

    const base: Omit<NormalizedPunishment, 'rowHash' | 'status'> = {
      kind,
      sourceId,
      subjectUuid: uuid(data.subjectUuid),
      subjectName: sanitizeLabel(nullableStr(data.subjectName, 32)),
      ipBan: bool(data.ipBan, false),
      reason: sanitizeReason(nullableStr(data.reason, 2048)),
      executor: parseActor(data.executor),
      startedAt,
      until,
      removal,
      scope: sanitizeLabel(nullableStr(data.scope, 32)),
      origin: sanitizeLabel(nullableStr(data.origin, 32)),
      silent: bool(data.silent, false),
      template:
        typeof template === 'number' && template !== 255 ? template : null,
      sourceActive: eventType !== 'removed',
    };
    return {
      ok: true,
      value: {
        type: eventType,
        punishment: { ...base, status, rowHash: computeRowHash(base) },
      },
    };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false };
    throw e;
  }
}

const PLUGIN_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$/;
const PLATFORM_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+ -]{0,47}$/;

export interface HelloData {
  pluginVersion: string | null;
  platform: string | null;
}

/// `bridge.hello`: информационные поля; неизвестные поля игнорируются и не
/// сохраняются (3.3 и 5 контракта). Длины согласованы с колонками БД.
export function parseHello(data: Record<string, unknown>): Parsed<HelloData> {
  try {
    const pluginVersion = nullableStr(data.pluginVersion, 32);
    const platform = nullableStr(data.platform, 48);
    // L4: строгий формат (в БД и админку не попадает произвольный текст).
    if (pluginVersion !== null && !PLUGIN_VERSION_PATTERN.test(pluginVersion)) fail();
    if (platform !== null && !PLATFORM_PATTERN.test(platform)) fail();
    if (data.protocol !== undefined && data.protocol !== 1) fail();
    return { ok: true, value: { pluginVersion, platform } };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false };
    throw e;
  }
}

export interface OverflowData {
  fromSeq: number;
  toSeq: number;
  dropped: number;
}

export function parseOverflow(
  data: Record<string, unknown>,
): Parsed<OverflowData> {
  const ok = (v: unknown): v is number =>
    typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
  if (!ok(data.fromSeq) || !ok(data.toSeq) || !ok(data.dropped)) {
    return { ok: false };
  }
  if (data.toSeq < data.fromSeq) return { ok: false };
  return {
    ok: true,
    value: {
      fromSeq: data.fromSeq,
      toSeq: data.toSeq,
      dropped: data.dropped,
    },
  };
}
