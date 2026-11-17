import type {
  PunishmentActivityFilter,
  PunishmentKind,
  PunishmentOrder,
  PunishmentPublicKind,
  PunishmentViewStatus,
} from '@twomc/shared';
import { api } from '@/lib/api/client';

/// Белый список полей наказаний сервера (этап 02, срез 2, BANS-API-CONTRACT.md).
/// Всё, что рендерится, проходит через `toPublicView` / `toMyView`: объект
/// собирается явно по полям, лишние ключи ответа (IP, uuid, контакты — даже
/// если придут по ошибке) отбрасываются и до разметки не доходят.
/// Тексты причины не очищаются и не додумываются: выводятся ровно как отдаёт API.

export type ExecutorView = { kind: 'console' } | { kind: 'name'; name: string } | { kind: 'none' };
export type ScopeView = { kind: 'global' } | { kind: 'server'; name: string } | { kind: 'unknown' };

export interface PunishmentViewBase {
  ref: string;
  kind: PunishmentKind;
  status: PunishmentViewStatus;
  startedAt: string;
  until: string | null;
  permanent: boolean;
  removedAt: string | null;
  executor: ExecutorView;
  scope: ScopeView;
}

export interface PublicPunishmentView extends PunishmentViewBase {
  subjectName: string;
  /// Подпись причины (`reason.label`) как есть; если пуста или отсутствует — «Нарушение правил» (Q59).
  reasonLabel: string;
}

export interface MyPunishmentView extends PunishmentViewBase {
  /// Полный очищенный текст; null — не указана.
  reason: string | null;
  reasonMasked: boolean;
}

export interface PunishmentPageMeta {
  stale: boolean;
}

export const PUBLIC_REF_PATTERN = /^(ban|mute)-[1-9][0-9]{0,17}$/;
export const NAME_SEARCH_PATTERN = /^[A-Za-z0-9_.]{3,16}$/;

const DEFAULT_REASON_LABEL = 'Нарушение правил';
const KINDS: readonly PunishmentKind[] = ['BAN', 'MUTE', 'WARN', 'KICK'];
const STATUSES: readonly PunishmentViewStatus[] = ['ACTIVE', 'EXPIRED', 'REMOVED'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function toExecutor(value: unknown): ExecutorView {
  if (isRecord(value)) {
    if (value.console === true) {
      return { kind: 'console' };
    }
    const name = str(value.name);
    if (name) {
      return { kind: 'name', name };
    }
  }
  return { kind: 'none' };
}

function toScope(value: unknown): ScopeView {
  if (isRecord(value)) {
    if (value.kind === 'global') {
      return { kind: 'global' };
    }
    const name = str(value.name);
    if (value.kind === 'server' && name) {
      return { kind: 'server', name };
    }
  }
  return { kind: 'unknown' };
}

function toBase(raw: Record<string, unknown>): PunishmentViewBase | null {
  const ref = str(raw.ref);
  const startedAt = str(raw.startedAt);
  const kind = KINDS.find((item) => item === raw.kind);
  const status = STATUSES.find((item) => item === raw.status);
  if (!ref || !startedAt || !kind || !status) {
    return null;
  }
  const until = str(raw.until);
  return {
    ref,
    kind,
    status,
    startedAt,
    until,
    permanent: raw.permanent === true || until === null,
    removedAt: str(raw.removedAt),
    executor: toExecutor(raw.executor),
    scope: toScope(raw.scope),
  };
}

export function toPublicView(raw: unknown): PublicPunishmentView | null {
  if (!isRecord(raw)) {
    return null;
  }
  const base = toBase(raw);
  const subjectName = str(raw.subjectName);
  const reason = isRecord(raw.reason) ? str(raw.reason.label) : null;
  if (!base || !subjectName) {
    return null;
  }
  return {
    ...base,
    subjectName,
    reasonLabel: reason !== null && reason.trim() !== '' ? reason : DEFAULT_REASON_LABEL,
  };
}

export function toMyView(raw: unknown): MyPunishmentView | null {
  if (!isRecord(raw)) {
    return null;
  }
  const base = toBase(raw);
  if (!base) {
    return null;
  }
  return { ...base, reason: str(raw.reason), reasonMasked: raw.reasonMasked === true };
}

function metaOf(raw: Record<string, unknown>): PunishmentPageMeta {
  return { stale: isRecord(raw.meta) && raw.meta.stale === true };
}

export interface PublicPage {
  items: PublicPunishmentView[];
  nextCursor: string | null;
  meta: PunishmentPageMeta;
}

export interface MyPage {
  linked: boolean;
  items: MyPunishmentView[];
  nextCursor: string | null;
  meta: PunishmentPageMeta;
}

function collect<T>(raw: unknown, map: (item: unknown) => T | null): T[] {
  const items = isRecord(raw) && Array.isArray(raw.items) ? raw.items : [];
  return items.map(map).filter((item): item is T => item !== null);
}

const cursorOf = (raw: unknown): string | null =>
  isRecord(raw) && typeof raw.nextCursor === 'string' && raw.nextCursor ? raw.nextCursor : null;

export interface PublicFilters {
  kind: PunishmentPublicKind | 'ALL';
  status: PunishmentActivityFilter | 'ALL';
  name: string;
  order: PunishmentOrder;
}

export const PUBLIC_PAGE_LIMIT = 25;

export async function fetchPublicPage(
  filters: PublicFilters,
  cursor: string | undefined,
  signal?: AbortSignal,
): Promise<PublicPage> {
  const query = {
    kind: filters.kind === 'ALL' ? undefined : filters.kind,
    status: filters.status === 'ALL' ? undefined : filters.status,
    name: filters.name || undefined,
    order: filters.order,
    limit: PUBLIC_PAGE_LIMIT,
    cursor,
  };
  const raw = await api.get<unknown>('/punishments/public', { auth: false, query, signal });
  return {
    items: collect(raw, toPublicView),
    nextCursor: cursorOf(raw),
    meta: isRecord(raw) ? metaOf(raw) : { stale: false },
  };
}

export async function fetchPublicOne(
  ref: string,
  signal?: AbortSignal,
): Promise<{
  item: PublicPunishmentView | null;
  meta: PunishmentPageMeta;
}> {
  const raw = await api.get<unknown>(`/punishments/public/${encodeURIComponent(ref)}`, {
    auth: false,
    signal,
  });
  return {
    item: isRecord(raw) ? toPublicView(raw.item) : null,
    meta: isRecord(raw) ? metaOf(raw) : { stale: false },
  };
}

export interface MyFilters {
  status: PunishmentActivityFilter | 'ALL';
}

export const MY_PAGE_LIMIT = 25;

export async function fetchMyPage(
  filters: MyFilters,
  cursor: string | undefined,
  signal?: AbortSignal,
): Promise<MyPage> {
  const raw = await api.get<unknown>('/punishments/me', {
    signal,
    query: {
      status: filters.status === 'ALL' ? undefined : filters.status,
      limit: MY_PAGE_LIMIT,
      cursor,
    },
  });
  return {
    linked: isRecord(raw) && raw.linked === true,
    items: collect(raw, toMyView),
    nextCursor: cursorOf(raw),
    meta: isRecord(raw) ? metaOf(raw) : { stale: false },
  };
}

export const KIND_LABELS: Record<PunishmentKind, string> = {
  BAN: 'Бан',
  MUTE: 'Мут',
  WARN: 'Предупреждение',
  KICK: 'Кик',
};

export const STATUS_LABELS: Record<PunishmentViewStatus, string> = {
  ACTIVE: 'Действует',
  EXPIRED: 'Истёк',
  REMOVED: 'Снят',
};
