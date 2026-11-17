import { createHash } from 'crypto';
import { computePunishmentStatus } from './punishment-status';
import {
  NormalizedPunishment,
  PunishmentActor,
  PunishmentKind,
  PunishmentRemoval,
  SourceDataInvalid,
} from './punishment.types';
import { sanitizeLabel, sanitizeReason } from './text-sanitizer';

/// Сырая строка источника в виде примитивов, не зависящих от драйвера БД.
/// Адаптер (MySQL/Bridge) приводит свои типы к этому виду и вызывает
/// `normalizePunishmentRow`; столбца `ip` здесь нет намеренно.
export interface RawPunishmentRow {
  kind: PunishmentKind;
  id: bigint | number | string;
  uuid: string | null;
  /// Ник из `history`, если адаптер его разрешил.
  subjectName?: string | null;
  reason: string | null;
  bannedByUuid: string | null;
  bannedByName: string | null;
  removedByUuid: string | null;
  removedByName: string | null;
  removedByReason: string | null;
  removedByDate: Date | null;
  /// Начало, мс Unix UTC.
  time: bigint | number | string;
  /// Конец, мс Unix UTC; `<= 0` — бессрочно.
  until: bigint | number | string;
  template: number | null;
  serverScope: string | null;
  serverOrigin: string | null;
  silent: boolean;
  ipban: boolean;
  active: boolean;
}

/// Максимальная дата JS (мс): всё, что больше, превращается в Invalid Date.
const MAX_DATE_MS = 8_640_000_000_000_000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NO_TEMPLATE = 255;

/// Пустое значение в LiteBans: NULL, пустая строка или строка, начинающаяся
/// с `#` (например, `#expired` в `removed_by_name`). Иначе — обрезанная строка.
export function normalizeSourceString(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.startsWith('#')) return null;
  return trimmed;
}

/// UUID в нижнем регистре с дефисами; всё прочее (пусто, `#...`, мусор) — null.
export function normalizeUuid(value: string | null | undefined): string | null {
  const v = normalizeSourceString(value)?.toLowerCase() ?? null;
  if (v === null) return null;
  if (/^[0-9a-f]{32}$/.test(v)) {
    return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20)}`;
  }
  return UUID_RE.test(v) ? v : null;
}

/// Выдавший или снявший. Консоль определяется до очистки: имя `Console`
/// (любой регистр, возможны цветовые коды) или uuid `CONSOLE`.
export function normalizeActor(
  uuid: string | null | undefined,
  name: string | null | undefined,
): PunishmentActor | null {
  const rawName = normalizeSourceString(name);
  const rawUuid = normalizeSourceString(uuid);
  const cleanedName = sanitizeLabel(rawName);
  if (
    rawUuid?.toLowerCase() === 'console' ||
    cleanedName?.toLowerCase() === 'console'
  ) {
    return { console: true };
  }
  const normalizedUuid = normalizeUuid(rawUuid);
  if (normalizedUuid === null && cleanedName === null) return null;
  return { uuid: normalizedUuid, name: cleanedName };
}

function toBigInt(value: bigint | number | string): bigint {
  try {
    if (typeof value === 'string' && !/^-?\d{1,20}$/.test(value.trim())) {
      throw new SourceDataInvalid();
    }
    if (typeof value === 'number' && !Number.isSafeInteger(value)) {
      throw new SourceDataInvalid();
    }
    return BigInt(typeof value === 'string' ? value.trim() : value);
  } catch {
    throw new SourceDataInvalid();
  }
}

function msToDate(ms: bigint): Date {
  if (ms < 0n || ms > BigInt(MAX_DATE_MS)) throw new SourceDataInvalid();
  return new Date(Number(ms));
}

function actorKey(actor: PunishmentActor | null): unknown {
  if (actor === null) return null;
  return actor.console === true
    ? ['console']
    : ['player', actor.uuid, actor.name];
}

/// SHA-256 нормализованных полей. Не включает статус: он вычисляется от
/// текущего времени и не должен давать ложных изменений (раздел 7 дизайна).
/// Флаг `sourceActive` входит, чтобы переход `active` в 0 без снятия (и
/// изменение причины, срока, снятие) менял хеш.
export function computeRowHash(
  p: Omit<NormalizedPunishment, 'rowHash' | 'status'>,
): string {
  const payload = [
    'v1',
    p.kind,
    p.sourceId,
    p.subjectUuid,
    p.subjectName,
    p.ipBan,
    p.reason,
    actorKey(p.executor),
    p.startedAt.getTime(),
    p.until === null ? null : p.until.getTime(),
    p.removal === null
      ? null
      : [
          actorKey(p.removal.by),
          p.removal.reason,
          p.removal.at === null ? null : p.removal.at.getTime(),
        ],
    p.scope,
    p.origin,
    p.silent,
    p.template,
    p.sourceActive,
  ];
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/// Приводит сырую строку к `NormalizedPunishment`: очистка текстов (в том
/// числе IP и контакты в причине), статус по разделу 3.3, `rowHash`.
/// `nowMs` — серверное время источника (с поправкой на расхождение часов).
/// Некорректные id и даты — `SourceDataInvalid` (строка пропускается).
export function normalizePunishmentRow(
  raw: RawPunishmentRow,
  nowMs: number,
): NormalizedPunishment {
  const id = toBigInt(raw.id);
  if (id <= 0n) throw new SourceDataInvalid();
  const startedAt = msToDate(toBigInt(raw.time));
  const untilRaw = toBigInt(raw.until);
  const until = untilRaw <= 0n ? null : msToDate(untilRaw);

  // Любое непустое значение (не NULL и не `#...`) означает снятие; консоль
  // тоже снимает. `#expired` — автоматическое истечение, а не снятие.
  const removedByUuid = normalizeSourceString(raw.removedByUuid);
  const removedByName = normalizeSourceString(raw.removedByName);

  const status = computePunishmentStatus(
    {
      kind: raw.kind,
      active: raw.active,
      untilMs: until === null ? 0 : until.getTime(),
      removedByUuid,
      removedByName,
    },
    nowMs,
  );

  let removal: PunishmentRemoval | null = null;
  if (status === 'REMOVED') {
    removal = {
      by: normalizeActor(raw.removedByUuid, raw.removedByName),
      reason: sanitizeReason(raw.removedByReason),
      at: raw.removedByDate,
    };
  }

  const base: Omit<NormalizedPunishment, 'rowHash' | 'status'> = {
    kind: raw.kind,
    sourceId: id.toString(),
    subjectUuid: normalizeUuid(raw.uuid),
    subjectName: sanitizeLabel(normalizeSourceString(raw.subjectName)),
    ipBan: raw.ipban,
    reason: sanitizeReason(raw.reason),
    executor: normalizeActor(raw.bannedByUuid, raw.bannedByName),
    startedAt,
    until,
    removal,
    scope: sanitizeLabel(raw.serverScope),
    origin: sanitizeLabel(raw.serverOrigin),
    silent: raw.silent,
    template:
      raw.template === null ||
      raw.template === NO_TEMPLATE ||
      !Number.isInteger(raw.template) ||
      raw.template < 0
        ? null
        : raw.template,
    sourceActive: raw.active,
  };
  return { ...base, status, rowHash: computeRowHash(base) };
}
