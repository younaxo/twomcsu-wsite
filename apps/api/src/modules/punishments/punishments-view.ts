import { createHash } from 'crypto';
import type { MinecraftPunishment } from '@prisma/client';
import {
  MyPunishment,
  MyPunishmentAppeal,
  PUNISHMENT_REASON_KEYS,
  PublicPunishment,
  PublicPunishmentExecutor,
  PunishmentReasonKey,
  PunishmentScopeView,
  PunishmentViewStatus,
  StaffPunishment,
  StaffPunishmentActor,
} from './api/punishments-api.types';
import { computePunishmentStatus } from './punishment-status';
import { publicRef } from './punishment.types';
import { REDACTED, isReasonMasked } from './text-sanitizer';

/// Слой представления (ADR-0180, разделы 3, 4, 6): строки зеркала -> ответы.
/// Публичные ответы собираются явным перечислением полей (белый список), а не
/// вычитанием лишнего. Чистые функции, без обращений к БД.

export type MirrorRow = MinecraftPunishment;

/// Ник нарушителя и выдавшего в публичном выводе (контракт 2.2, 4.1).
export const PUBLIC_NAME_RE = /^[A-Za-z0-9_.]{1,16}$/;
/// Название области (контракт 4.4).
export const PUBLIC_SCOPE_RE = /^[A-Za-z0-9_.-]{1,32}$/;
/// `ref` публичной ссылки (контракт 2.3): не более 18 цифр, без ведущего нуля.
export const REF_RE = /^(ban|mute|warn|kick)-[1-9][0-9]{0,17}$/;
export const PUBLIC_REF_RE = /^(ban|mute)-[1-9][0-9]{0,17}$/;

export const REASON_LABELS: Readonly<Record<PunishmentReasonKey, string>> = {
  cheats: 'Читы',
  abuse: 'Оскорбления',
  spam: 'Спам',
  advertising: 'Реклама',
  evasion: 'Обход наказания',
  other: 'Прочее',
  rules: 'Нарушение правил',
};

export const GLOBAL_SCOPE_MARK = '*';

/// Разбор `ref`: вид и числовой id в виде строки; формат проверяется ДО
/// любого приведения к bigint (переполнение невозможно).
export function parseRef(
  ref: string,
  publicOnly: boolean,
): { kind: 'BAN' | 'MUTE' | 'WARN' | 'KICK'; sourceId: bigint } | null {
  const re = publicOnly ? PUBLIC_REF_RE : REF_RE;
  if (typeof ref !== 'string' || !re.test(ref)) return null;
  const dash = ref.indexOf('-');
  const kind = ref.slice(0, dash).toUpperCase() as
    'BAN' | 'MUTE' | 'WARN' | 'KICK';
  return { kind, sourceId: BigInt(ref.slice(dash + 1)) };
}

/// Карта причин (контракт 3.2): по умолчанию пустая и выключенная.
export interface ReasonMap {
  enabled: boolean;
  templates: ReadonlyMap<number, PunishmentReasonKey>;
  phrases: ReadonlyMap<string, PunishmentReasonKey>;
}

export const EMPTY_REASON_MAP: ReasonMap = {
  enabled: false,
  templates: new Map(),
  phrases: new Map(),
};

const MAX_MAP_ENTRIES = 200;
const MAX_PHRASE_LENGTH = 64;

/// Нормализация фразы: NFKC, нижний регистр, схлопывание пробелов, обрезка
/// пробелов и завершающих `.!`.
export function normalizePhrase(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!\s]+$/u, '')
    .trim();
}

function isReasonKey(value: unknown): value is PunishmentReasonKey {
  return (
    typeof value === 'string' &&
    (PUNISHMENT_REASON_KEYS as readonly string[]).includes(value)
  );
}

/// Разбор `punishments.public.reasonMap`. Неверный JSON или значение
/// отбрасывает карту целиком (пустая карта). `enabled` приходит отдельно.
export function parseReasonMap(
  raw: string | null | undefined,
  enabled: boolean,
): ReasonMap {
  if (!enabled || !raw) return { ...EMPTY_REASON_MAP, enabled };
  try {
    const json: unknown = JSON.parse(raw);
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      return EMPTY_REASON_MAP;
    }
    const { templates, phrases } = json as Record<string, unknown>;
    const tpl = new Map<number, PunishmentReasonKey>();
    const phr = new Map<string, PunishmentReasonKey>();
    const tplEntries =
      templates && typeof templates === 'object' && !Array.isArray(templates)
        ? Object.entries(templates as Record<string, unknown>)
        : [];
    const phrEntries =
      phrases && typeof phrases === 'object' && !Array.isArray(phrases)
        ? Object.entries(phrases as Record<string, unknown>)
        : [];
    if (tplEntries.length + phrEntries.length > MAX_MAP_ENTRIES) {
      return EMPTY_REASON_MAP;
    }
    for (const [id, key] of tplEntries) {
      if (!/^\d{1,9}$/.test(id) || !isReasonKey(key)) return EMPTY_REASON_MAP;
      tpl.set(Number(id), key);
    }
    for (const [phrase, key] of phrEntries) {
      const normalized = normalizePhrase(phrase);
      if (
        normalized.length === 0 ||
        normalized.length > MAX_PHRASE_LENGTH ||
        !isReasonKey(key)
      ) {
        return EMPTY_REASON_MAP;
      }
      phr.set(normalized, key);
    }
    return { enabled: true, templates: tpl, phrases: phr };
  } catch {
    return EMPTY_REASON_MAP;
  }
}

/// Категория публичной причины (контракт 3.2): первое совпадение из
/// 1) маркер маскировки -> rules; 2) шаблон; 3) точная фраза; 4) rules.
/// Только равенство целой строки, подстрок и ключевых слов нет.
export function categorizeReason(
  reason: string | null,
  template: number | null,
  map: ReasonMap,
): PunishmentReasonKey {
  if (isReasonMasked(reason)) return 'rules';
  if (!map.enabled) return 'rules';
  if (template !== null) {
    const byTemplate = map.templates.get(template);
    if (byTemplate !== undefined) return byTemplate;
  }
  if (reason !== null) {
    const byPhrase = map.phrases.get(normalizePhrase(reason));
    if (byPhrase !== undefined) return byPhrase;
  }
  return 'rules';
}

/// Выдавший для публичного слоя и «Мои наказания» (контракт 4.1, 4.2).
export function publicExecutor(
  row: Pick<MirrorRow, 'issuerHidden' | 'executorIsConsole' | 'executorName'>,
): PublicPunishmentExecutor | null {
  if (row.issuerHidden) return null;
  if (row.executorIsConsole) return { console: true };
  const name = row.executorName;
  if (
    typeof name === 'string' &&
    PUBLIC_NAME_RE.test(name) &&
    !name.includes(REDACTED)
  ) {
    return { name };
  }
  return null;
}

export interface SiteServerRef {
  slug: string;
  name: string;
}

/// Область с названием сервера (контракт 4.4).
export function scopeView(
  serverScope: string | null,
  servers: readonly SiteServerRef[],
): PunishmentScopeView {
  if (serverScope === null) return { kind: 'unknown' };
  const raw = serverScope.trim();
  if (raw === GLOBAL_SCOPE_MARK) return { kind: 'global' };
  if (raw.length === 0 || raw.includes(REDACTED)) return { kind: 'unknown' };
  const lower = raw.toLowerCase();
  const bySlug = servers.find((s) => s.slug.toLowerCase() === lower);
  const byName = servers.find((s) => s.name.toLowerCase() === lower);
  const site = bySlug ?? byName;
  if (site && site.name.trim().length > 0) {
    return { kind: 'server', name: site.name };
  }
  if (PUBLIC_SCOPE_RE.test(raw)) return { kind: 'server', name: raw };
  return { kind: 'unknown' };
}

/// Статус при чтении: ACTIVE с истёкшим `until` отдаётся как EXPIRED.
export function viewStatus(
  row: Pick<MirrorRow, 'kind' | 'status' | 'until'>,
  nowMs: number,
): PunishmentViewStatus | 'DELETED_AT_SOURCE' {
  if (row.status !== 'ACTIVE') return row.status;
  return computePunishmentStatus(
    {
      kind: row.kind,
      active: true,
      untilMs: row.until ? row.until.getTime() : 0,
      removedByUuid: null,
      removedByName: null,
    },
    nowMs,
  );
}

export function refOf(row: Pick<MirrorRow, 'kind' | 'sourceId'>): string {
  return publicRef(row.kind, row.sourceId.toString());
}

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

export interface PublicViewContext {
  nowMs: number;
  servers: readonly SiteServerRef[];
  reasonMap: ReasonMap;
}

/// Публичный элемент: явная сборка по белому списку полей (контракт 6).
/// Вызывать только для строк, прошедших предикат публичности.
export function toPublicPunishment(
  row: MirrorRow,
  ctx: PublicViewContext,
): PublicPunishment | null {
  const status = viewStatus(row, ctx.nowMs);
  if (status === 'DELETED_AT_SOURCE') return null;
  if (
    (row.kind !== 'BAN' && row.kind !== 'MUTE') ||
    row.subjectName === null ||
    !PUBLIC_NAME_RE.test(row.subjectName)
  ) {
    return null;
  }
  const ref = refOf(row);
  // 19-значный sourceId дал бы ref вне формата 2.3 (недостижимо для автоинкремента).
  if (!PUBLIC_REF_RE.test(ref)) return null;
  const key = categorizeReason(row.reason, row.template, ctx.reasonMap);
  return {
    ref,
    kind: row.kind,
    subjectName: row.subjectName,
    status,
    startedAt: row.startedAt.toISOString(),
    until: iso(row.until),
    permanent: row.until === null,
    removedAt: status === 'REMOVED' ? iso(row.removedAt) : null,
    reason: { key, label: REASON_LABELS[key] },
    executor: publicExecutor(row),
    scope: scopeView(row.serverScope, ctx.servers),
  };
}

/// Статусы обращения, при которых обжалование считается открытым.
const OPEN_APPEAL_STATUSES: ReadonlySet<string> = new Set([
  'PENDING',
  'IN_REVIEW',
  'WAITING_RESPONSE',
]);

/// Обжалуемость (Q57 О2): активные BAN и MUTE без открытого обжалования.
export function isAppealable(
  kind: MirrorRow['kind'],
  status: PunishmentViewStatus,
  appeals: readonly Pick<MyPunishmentAppeal, 'status'>[],
): boolean {
  return (
    (kind === 'BAN' || kind === 'MUTE') &&
    status === 'ACTIVE' &&
    !appeals.some((a) => OPEN_APPEAL_STATUSES.has(a.status))
  );
}

export function toMyPunishment(
  row: MirrorRow,
  ctx: Pick<PublicViewContext, 'nowMs' | 'servers'>,
  appeals: readonly MyPunishmentAppeal[] = [],
): MyPunishment | null {
  const status = viewStatus(row, ctx.nowMs);
  if (status === 'DELETED_AT_SOURCE') return null;
  return {
    ref: refOf(row),
    kind: row.kind,
    status,
    startedAt: row.startedAt.toISOString(),
    until: iso(row.until),
    permanent: row.until === null,
    removedAt: status === 'REMOVED' ? iso(row.removedAt) : null,
    reason: row.reason,
    reasonMasked: isReasonMasked(row.reason),
    executor: publicExecutor(row),
    scope: scopeView(row.serverScope, ctx.servers),
    appealable: isAppealable(row.kind, status, appeals),
    appeals: [...appeals],
  };
}

function staffActor(
  isConsole: boolean,
  uuid: string | null,
  name: string | null,
): StaffPunishmentActor | null {
  if (!isConsole && uuid === null && name === null) return null;
  return { console: isConsole, uuid, name };
}

export function toStaffPunishment(
  row: MirrorRow,
  nowMs: number,
): StaffPunishment {
  const status = viewStatus(row, nowMs);
  return {
    ref: refOf(row),
    kind: row.kind,
    status,
    subjectUuid: row.subjectUuid,
    subjectName: row.subjectName,
    ipBan: row.ipBan,
    silent: row.silent,
    reason: row.reason,
    reasonMasked: isReasonMasked(row.reason),
    executor: staffActor(
      row.executorIsConsole,
      row.executorUuid,
      row.executorName,
    ),
    startedAt: row.startedAt.toISOString(),
    until: iso(row.until),
    permanent: row.until === null,
    removedAt: status === 'REMOVED' ? iso(row.removedAt) : null,
    removedBy: staffActor(
      row.removedByIsConsole,
      row.removedByUuid,
      row.removedByName,
    ),
    removedReason: row.removedReason,
    scope: row.serverScope,
    origin: row.serverOrigin,
    template: row.template,
    isHidden: row.isHidden,
    hiddenReason: row.hiddenReason,
    issuerHidden: row.issuerHidden,
    issuerHiddenById: row.issuerHiddenById,
    issuerHiddenAt: iso(row.issuerHiddenAt),
    issuerHiddenReason: row.issuerHiddenReason,
    deletedAtSource: iso(row.deletedAtSource),
    rev: row.rev,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastChangedAt: row.lastChangedAt.toISOString(),
  };
}

/// Слабый ETag по каноническому JSON тела без `meta.generatedAt`.
export function weakEtag(body: {
  meta?: { generatedAt?: unknown; [key: string]: unknown };
  [key: string]: unknown;
}): string {
  const { meta, ...rest } = body;
  const stable = {
    ...rest,
    meta: meta ? { ...meta, generatedAt: undefined } : undefined,
  };
  const hash = createHash('sha256')
    .update(canonicalJson(stable))
    .digest('hex')
    .slice(0, 32);
  return `W/"${hash}"`;
}

/// JSON с отсортированными ключами; `undefined` пропускается.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(',')}}`;
}
