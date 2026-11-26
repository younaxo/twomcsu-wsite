import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/// Флаг публичного раздела статистики (`SiteSetting`, без миграции): рейтинги и
/// игровая статистика в профиле. По умолчанию ВЫКЛЮЧЕН; включается только
/// значением `true` через админские настройки (`settings.edit`). Читается на
/// каждый запрос (выборка по первичному ключу), поэтому действует сразу.
export const SETTING_STATS_PUBLIC_ENABLED = 'stats.public.enabled';

@Injectable()
export class StatsSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async isPublicEnabled(): Promise<boolean> {
    const row = await this.prisma.siteSetting.findUnique({
      where: { key: SETTING_STATS_PUBLIC_ENABLED },
    });
    return row?.value === 'true';
  }
}
