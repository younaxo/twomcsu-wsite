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
