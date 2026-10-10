import type { IsoDateString } from './common';

/// Модули сайта и технические работы (ADR-0082).

/// core — ядро (вход, роли, админка, мониторинг): выключить нельзя, иначе
/// не восстановить доступ; protected — широкий эффект, нужно особое право и
/// подтверждение; regular — обычный модуль.
export type SiteModuleTier = 'core' | 'protected' | 'regular';

/// Ответ API при недоступности (HTTP 503, поле `code` тела ошибки).
export const SITE_UNAVAILABLE_CODES = ['MODULE_DISABLED', 'MAINTENANCE'] as const;
export type SiteUnavailableCode = (typeof SITE_UNAVAILABLE_CODES)[number];

export interface SiteModuleDto {
  key: string;
  label: string;
  description: string;
  tier: SiteModuleTier;
  enabled: boolean;
  reason: string | null;
  disabledAt: IsoDateString | null;
}

export interface UpdateSiteModuleRequest {
  enabled: boolean;
  /// Причина — видна только в админке и аудите.
  reason?: string | null;
}

export type MaintenanceScope = 'full' | 'partial';

export interface MaintenanceSettingsDto {
  enabled: boolean;
  scope: MaintenanceScope;
  modules: string[];
  title: string;
  message: string;
  reason: string | null;
  startsAt: IsoDateString | null;
  estimatedEnd: IsoDateString | null;
  /// Идёт прямо сейчас (включено и начало наступило) — по времени сервера.
  active: boolean;
  enabledAt: IsoDateString | null;
  updatedAt: IsoDateString | null;
}

export type UpdateMaintenanceRequest = Omit<
  MaintenanceSettingsDto,
  'active' | 'enabledAt' | 'updatedAt'
>;

/// `GET /site/status` — для всех посетителей; причина не раскрывается.
export interface PublicSiteStatus {
  maintenance: {
    active: boolean;
    scope: MaintenanceScope;
    modules: string[];
    title: string;
    message: string;
    startsAt: IsoDateString | null;
    estimatedEnd: IsoDateString | null;
  } | null;
  /// Выключенные модули (ключи реестра).
  disabledModules: string[];
  serverTime: IsoDateString;
}

/// `GET /admin/system/overview` — сводка состояния на дашборде (`dashboard.view`).
export interface AdminSystemOverview {
  maintenance: PublicSiteStatus['maintenance'];
  disabledModules: string[];
  /// Опубликованные объявления, чьё окно показа идёт сейчас.
  activeAnnouncements: number;
  health: { database: 'ok' | 'error'; redis: 'ok' | 'error' };
  serverTime: IsoDateString;
}

// --- Хранилище и журналы (ADR-0084) ------------------------------------------

/// Категории служебных журналов. Пользовательские данные (профили, сообщения,
/// заказы, уведомления, файлы) в очистку не входят никогда.
export type StorageCategory = 'audit' | 'security' | 'serverStatus' | 'technical';

/// Срок автоматического хранения в днях; 0 — не удалять.
export const STORAGE_RETENTION_OPTIONS = [7, 30, 90, 180, 365, 0] as const;
export type StorageRetentionDays = (typeof STORAGE_RETENTION_OPTIONS)[number];

/// Ручная очистка: старше N дней или все записи категории (`null`).
export const STORAGE_CLEANUP_PERIODS = [7, 30, 90, 180, 365, null] as const;
export type StorageCleanupPeriod = (typeof STORAGE_CLEANUP_PERIODS)[number];

export interface StorageCategoryDto {
  key: StorageCategory;
  label: string;
  description: string;
  /// Аудит и безопасность — отдельное право `system.storage.audit`.
  sensitive: boolean;
  retentionDays: StorageRetentionDays;
  /// Записей всего / к удалению по текущему сроку (0 — если «не удалять»).
  total: number;
  due: number;
  /// Оценка объёма по размеру таблиц, байты.
  totalBytes: number;
  dueBytes: number;
}

export interface StorageOverviewDto {
  autoCleanup: boolean;
  categories: StorageCategoryDto[];
  lastRunAt: IsoDateString | null;
  lastRunTrigger: 'auto' | 'manual' | null;
  lastResult: Partial<Record<StorageCategory, number>> | null;
}

export interface UpdateStorageRetentionRequest {
  autoCleanup?: boolean;
  retention?: Partial<Record<StorageCategory, StorageRetentionDays>>;
}

export interface StorageCleanupPreviewRequest {
  category: StorageCategory;
  olderThanDays: StorageCleanupPeriod;
}

export interface StorageCleanupPreview {
  count: number;
  bytes: number;
}

/// `confirmCount` — число из предпросмотра: если записей к удалению стало
/// больше, сервер отклонит очистку (409).
export interface StorageCleanupRequest extends StorageCleanupPreviewRequest {
  confirmCount: number;
}

export interface StorageCleanupResult {
  deleted: number;
}
