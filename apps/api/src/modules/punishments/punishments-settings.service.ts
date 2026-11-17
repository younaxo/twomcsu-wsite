import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReasonMap, parseReasonMap } from './punishments-view';

/// Настройки публичного слоя (`SiteSetting`, контракт 5, 3.2). Читаются при
/// каждом запросе (одна выборка по ключам); значения входят в ключ кэша, поэтому
/// смена настройки действует сразу.
export const SETTING_PUBLIC_ENABLED = 'punishments.public.enabled';
export const SETTING_HIDE_SILENT = 'punishments.public.hideSilent';
export const SETTING_REASON_MAP = 'punishments.public.reasonMap';
export const SETTING_REASON_MAP_ENABLED =
  'punishments.public.reasonMap.enabled';

export interface PublicPunishmentSettings {
  enabled: boolean;
  /// По умолчанию true (допущение О1).
  hideSilent: boolean;
  reasonMap: ReasonMap;
  /// Для ключа кэша.
  fingerprint: string;
}

@Injectable()
export class PunishmentsSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async isPublicEnabled(): Promise<boolean> {
    const row = await this.prisma.siteSetting.findUnique({
      where: { key: SETTING_PUBLIC_ENABLED },
    });
    return row?.value === 'true';
  }

  async readPublic(): Promise<PublicPunishmentSettings> {
    const rows = await this.prisma.siteSetting.findMany({
      where: {
        key: {
          in: [
            SETTING_PUBLIC_ENABLED,
            SETTING_HIDE_SILENT,
            SETTING_REASON_MAP,
            SETTING_REASON_MAP_ENABLED,
          ],
        },
      },
    });
    const get = (key: string): string | undefined =>
      rows.find((r) => r.key === key)?.value;
    const enabled = get(SETTING_PUBLIC_ENABLED) === 'true';
    const hideSilent = get(SETTING_HIDE_SILENT) !== 'false';
    const mapEnabled = get(SETTING_REASON_MAP_ENABLED) === 'true';
    const rawMap = get(SETTING_REASON_MAP);
    return {
      enabled,
      hideSilent,
      reasonMap: parseReasonMap(rawMap, mapEnabled),
      fingerprint: JSON.stringify([
        enabled,
        hideSilent,
        mapEnabled,
        mapEnabled ? (rawMap ?? '') : '',
      ]),
    };
  }
}
