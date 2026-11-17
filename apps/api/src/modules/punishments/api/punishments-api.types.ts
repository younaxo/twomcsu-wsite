/// Контракт API наказаний сервера (этап 02, срез 2, ADR-0180). Копия packages/shared/src/api/punishments.ts; расхождение
/// ловит punishments-contract-sync.spec.ts (R80).
export type IsoDateString = string;

interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  code?: string;
  details?: unknown;
  requestId?: string;
}

export const PUNISHMENT_PUBLIC_KINDS = ['BAN', 'MUTE'] as const;
export type PunishmentPublicKind = (typeof PUNISHMENT_PUBLIC_KINDS)[number];

export const PUNISHMENT_KINDS = ['BAN', 'MUTE', 'WARN', 'KICK'] as const;
export type PunishmentKind = (typeof PUNISHMENT_KINDS)[number];

/** Публичный и «мой» статус: DELETED_AT_SOURCE наружу не выходит. */
export const PUNISHMENT_VIEW_STATUSES = [
  'ACTIVE',
  'EXPIRED',
  'REMOVED',
] as const;
export type PunishmentViewStatus = (typeof PUNISHMENT_VIEW_STATUSES)[number];
export type PunishmentStaffStatus = PunishmentViewStatus | 'DELETED_AT_SOURCE';

export const PUNISHMENT_REASON_KEYS = [
  'cheats',
  'abuse',
  'spam',
  'advertising',
  'evasion',
  'other',
  'rules',
] as const;
export type PunishmentReasonKey = (typeof PUNISHMENT_REASON_KEYS)[number];

export const PUNISHMENT_ERROR_CODES = [
  'punishments_public_disabled',
  'punishments_not_found',
  'punishments_unavailable',
  'punishments_invalid_cursor',
  'admin_2fa_required',
  'punishments_issuer_hide_forbidden',
] as const;
export type PunishmentErrorCode = (typeof PUNISHMENT_ERROR_CODES)[number];

export type PunishmentOrder = 'asc' | 'desc';
export type PunishmentActivityFilter = 'active' | 'ended';

/** Ровно одно поле: консоль или имя. */
export type PublicPunishmentExecutor = { console: true } | { name: string };

/** Область действия (Q63 п.4): глобально, конкретный сервер или неизвестно. */
export type PunishmentScopeView =
  { kind: 'global' } | { kind: 'server'; name: string } | { kind: 'unknown' };

export interface PublicPunishment {
  /** `ban-123` / `mute-45`. */
  ref: string;
  kind: PunishmentPublicKind;
  /** Ник нарушителя, 1-16 символов, `[A-Za-z0-9_.]`. */
  subjectName: string;
  status: PunishmentViewStatus;
  startedAt: IsoDateString;
  /** null - бессрочно. */
  until: IsoDateString | null;
  permanent: boolean;
  /** Только при status === 'REMOVED', иначе null. */
  removedAt: IsoDateString | null;
  /** До присылки владельцем соответствия (Q63 п.1-2) всегда `rules`. */
  reason: { key: PunishmentReasonKey; label: string };
  /** Q63 п.3: виден по умолчанию; null - скрыт персоналом, не известен или не прошёл проверку имени. */
  executor: PublicPunishmentExecutor | null;
  /** Q63 п.4: область с названием сервера. */
  scope: PunishmentScopeView;
}

export interface PunishmentResponseMeta {
  /** Момент формирования ответа (в ETag не входит). */
  generatedAt: IsoDateString;
  /** Данные источника давно не обновлялись или источник выключен. */
  stale: boolean;
}

export interface PublicPunishmentListResponse {
  items: PublicPunishment[];
  nextCursor: string | null;
  meta: PunishmentResponseMeta;
}

export interface PublicPunishmentResponse {
  item: PublicPunishment;
  meta: PunishmentResponseMeta;
}

export interface PunishmentListQuery {
  cursor?: string;
  limit?: number;
  order?: PunishmentOrder;
}

export interface PublicPunishmentListQuery extends PunishmentListQuery {
  kind?: PunishmentPublicKind;
  status?: PunishmentActivityFilter;
  name?: string;
}

/** Мои наказания: полный очищенный текст причины. */
export interface MyPunishment {
  ref: string;
  kind: PunishmentKind;
  status: PunishmentViewStatus;
  startedAt: IsoDateString;
  until: IsoDateString | null;
  permanent: boolean;
  removedAt: IsoDateString | null;
  /** Очищенный текст (plain text, до 2048 символов); null - не указана. */
  reason: string | null;
  /** В очистке что-то было скрыто: в тексте есть маркер `[скрыто]`. */
  reasonMasked: boolean;
  /** Q63 п.3: как в публичном ответе (с учётом флага скрытия выдавшего). */
  executor: PublicPunishmentExecutor | null;
  /** Q63 п.4: область с названием сервера (4.4). */
  scope: PunishmentScopeView;
  /** Всегда false до среза обжалования зеркальных наказаний (раздел 9). */
  appealable: boolean;
}

export interface MyPunishmentListResponse {
  /** false - нет подтверждённой привязки Minecraft-аккаунта. */
  linked: boolean;
  items: MyPunishment[];
  nextCursor: string | null;
  meta: PunishmentResponseMeta;
}

export interface MyPunishmentListQuery extends PunishmentListQuery {
  kind?: PunishmentKind[];
  status?: PunishmentActivityFilter;
}

export interface StaffPunishmentActor {
  console: boolean;
  uuid: string | null;
  name: string | null;
}

export interface StaffPunishment {
  ref: string;
  kind: PunishmentKind;
  status: PunishmentStaffStatus;
  subjectUuid: string | null;
  subjectName: string | null;
  /** Бан по адресу. Сам адрес не хранится и не отдаётся. */
  ipBan: boolean;
  silent: boolean;
  reason: string | null;
  reasonMasked: boolean;
  executor: StaffPunishmentActor | null;
  startedAt: IsoDateString;
  until: IsoDateString | null;
  permanent: boolean;
  removedAt: IsoDateString | null;
  removedBy: StaffPunishmentActor | null;
  removedReason: string | null;
  scope: string | null;
  origin: string | null;
  template: number | null;
  isHidden: boolean;
  hiddenReason: string | null;
  /** Q63 п.3: выдавший принудительно скрыт публично и от игрока (4.2). */
  issuerHidden: boolean;
  issuerHiddenById: string | null;
  issuerHiddenAt: IsoDateString | null;
  issuerHiddenReason: string | null;
  deletedAtSource: IsoDateString | null;
  rev: number;
  firstSeenAt: IsoDateString;
  lastChangedAt: IsoDateString;
}

export interface StaffPunishmentListQuery extends PunishmentListQuery {
  kind?: PunishmentKind[];
  status?: PunishmentStaffStatus[];
  name?: string;
  nameExact?: string;
  subjectUuid?: string;
  silent?: boolean;
  ipBan?: boolean;
  hidden?: boolean;
  from?: IsoDateString;
  to?: IsoDateString;
}

export interface StaffPunishmentListResponse {
  items: StaffPunishment[];
  nextCursor: string | null;
  meta: PunishmentResponseMeta;
}

/** Тело POST /admin/punishments/:ref/issuer-hidden (Q63 п.3). */
export interface HidePunishmentIssuerBody {
  /** 1-200 символов, обычный текст. */
  reason: string;
}

/** Ответ POST и DELETE /admin/punishments/:ref/issuer-hidden. */
export interface StaffPunishmentResponse {
  item: StaffPunishment;
  meta: PunishmentResponseMeta;
}

export interface PunishmentsAdminStatus {
  enabled: boolean;
  configured: boolean;
  kinds: Array<{
    kind: PunishmentKind;
    initialSyncDone: boolean;
    lastSuccessAt: IsoDateString | null;
    consecutiveFailures: number;
    /** Только код `SOURCE_*`. */
    lastErrorCode: string | null;
  }>;
}

/**
 * Ошибка с кодом модуля: `ApiErrorBody` с обязательным `code`. Стандартные
 * 400/401/403/429 могут идти без `code` (тогда это обычный `ApiErrorBody`);
 * клиент ветвится по `statusCode`.
 */
export interface PunishmentErrorBody extends ApiErrorBody {
  code: PunishmentErrorCode;
}
