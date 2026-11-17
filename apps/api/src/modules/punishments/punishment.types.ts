/// Контракт источника наказаний (ADR-0166, раздел 3 дизайна этапа 02).
/// Контракт не знает про LiteBans: адаптер LiteBans (MySQL, срез 2) и будущий
/// Bridge (этап 03) реализуют один интерфейс. Write-методов нет и быть не может.

export const PUNISHMENT_KINDS = ['BAN', 'MUTE', 'WARN', 'KICK'] as const;
export type PunishmentKind = (typeof PUNISHMENT_KINDS)[number];

export const PUNISHMENT_STATUSES = [
  'ACTIVE',
  'EXPIRED',
  'REMOVED',
  'DELETED_AT_SOURCE',
] as const;
export type PunishmentStatus = (typeof PUNISHMENT_STATUSES)[number];

/// Выдавший или снявший: консоль либо игрок. Значения уже очищены.
export type PunishmentActor =
  | { console: true }
  | { console?: false; uuid: string | null; name: string | null };

export interface PunishmentRemoval {
  by: PunishmentActor | null;
  reason: string | null;
  at: Date | null;
}

export interface NormalizedPunishment {
  kind: PunishmentKind;
  /// Десятичная запись bigint; пара `(kind, sourceId)` — ключ.
  sourceId: string;
  subjectUuid: string | null;
  subjectName: string | null;
  /// Сам IP не читается и наружу не выдаётся.
  ipBan: boolean;
  /// Уже очищена (`sanitizeReason`): IP, контакты, цветовые коды удалены.
  reason: string | null;
  executor: PunishmentActor | null;
  startedAt: Date;
  /// null — бессрочно (`until <= 0` в источнике).
  until: Date | null;
  /// Вычислен `computePunishmentStatus`, а не взят из `active` источника.
  status: Exclude<PunishmentStatus, 'DELETED_AT_SOURCE'>;
  removal: PunishmentRemoval | null;
  scope: string | null;
  origin: string | null;
  silent: boolean;
  /// 255 («не задан») превращается в null.
  template: number | null;
  /// Флаг `active` источника. НЕ статус: LiteBans обновляет его пачками раз в
  /// ~20 часов. Входит в `rowHash`, чтобы переход в 0 без снятия не терялся.
  sourceActive: boolean;
  /// SHA-256 нормализованных полей (без вычисляемого от времени статуса).
  rowHash: string;
}

export interface SourceHealth {
  ok: boolean;
  version?: string;
  /// Серверное время источника, мс Unix UTC.
  serverTimeMs: number;
  code?: string;
}

export type SourceEvent =
  | {
      type: 'created' | 'updated' | 'removed';
      punishment: NormalizedPunishment;
    }
  | { type: 'deleted'; kind: PunishmentKind; sourceId: string };

export interface Disposable {
  dispose(): void;
}

export interface PunishmentSource {
  readonly id: 'litebans' | 'bridge' | 'test';
  health(): Promise<SourceHealth>;
  /// По возрастанию id, строго `id > afterId`.
  fetchBatch(
    kind: PunishmentKind,
    afterId: bigint,
    limit: number,
  ): Promise<NormalizedPunishment[]>;
  /// id строк, пропущенных последним `fetchBatch` как невалидные
  /// (SourceDataInvalid); возвращает и очищает список. Нужен полной сверке:
  /// такие строки есть в источнике и не должны получать DELETED_AT_SOURCE.
  /// Адаптер ОБЯЗАН также не включать невалидные строки в `missing`
  /// у `fetchByIds` (требование к срезу 2).
  drainSkippedIds?(kind: PunishmentKind): bigint[];
  /// До 500 id за вызов.
  fetchByIds(
    kind: PunishmentKind,
    ids: bigint[],
  ): Promise<{ found: NormalizedPunishment[]; missing: bigint[] }>;
  maxId(kind: PunishmentKind): Promise<bigint>;
  /// Последний ник по uuid (из `history` LiteBans).
  resolveNames(uuids: string[]): Promise<Map<string, string>>;
  /// У Bridge: push; у LiteBans не реализуется (источник — опрос).
  subscribe?(handler: (event: SourceEvent) => void): Disposable;
  close(): Promise<void>;
}

/// Публичная ссылка вида `ban-123` (раздел 5.3 дизайна). Действует при
/// единственном источнике.
export function publicRef(kind: PunishmentKind, sourceId: string): string {
  return `${kind.toLowerCase()}-${sourceId}`;
}

/// Ошибки источника (раздел 3.4). Тексты не содержат хост, учётку, пароль
/// и SQL с данными: сообщение задаётся фиксированным, причина не копируется.
export type SourceErrorCode =
  | 'SOURCE_NOT_CONFIGURED'
  | 'SOURCE_UNAVAILABLE'
  | 'SOURCE_AUTH_FAILED'
  | 'SOURCE_SCHEMA_MISMATCH'
  | 'SOURCE_DATA_INVALID';

export abstract class SourceError extends Error {
  abstract readonly code: SourceErrorCode;
  /// Можно ли повторять запрос.
  abstract readonly retryable: boolean;
}

export class SourceNotConfigured extends SourceError {
  readonly code = 'SOURCE_NOT_CONFIGURED' as const;
  readonly retryable = false;
  constructor() {
    super('Источник наказаний не настроен');
    this.name = 'SourceNotConfigured';
  }
}

/// Сеть или тайм-аут; повторяемая.
export class SourceUnavailable extends SourceError {
  readonly code = 'SOURCE_UNAVAILABLE' as const;
  readonly retryable = true;
  constructor() {
    super('Источник наказаний недоступен');
    this.name = 'SourceUnavailable';
  }
}

/// Не повторять, тревога.
export class SourceAuthFailed extends SourceError {
  readonly code = 'SOURCE_AUTH_FAILED' as const;
  readonly retryable = false;
  constructor() {
    super('Источник наказаний отклонил учётные данные');
    this.name = 'SourceAuthFailed';
  }
}

/// Нет ожидаемого столбца или типа: остановить опрос этой таблицы.
export class SourceSchemaMismatch extends SourceError {
  readonly code = 'SOURCE_SCHEMA_MISMATCH' as const;
  readonly retryable = false;
  constructor() {
    super('Схема источника наказаний не соответствует ожидаемой');
    this.name = 'SourceSchemaMismatch';
  }
}

/// Строка пропускается и считается в метрике.
export class SourceDataInvalid extends SourceError {
  readonly code = 'SOURCE_DATA_INVALID' as const;
  readonly retryable = false;
  constructor() {
    super('Строка источника наказаний содержит недопустимые данные');
    this.name = 'SourceDataInvalid';
  }
}
