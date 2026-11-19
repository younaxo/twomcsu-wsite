import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GiveawayAdminAuditService } from './giveaway-admin-audit.service';
import { badRequest, conflict } from './giveaway-errors';
import {
  GiveawaySettingsPatch,
  GiveawaySettingsService,
} from './giveaway-settings.service';

/// Настройки в админке (ADR-G003 п. 5.4): правила сервиса настроек плюс запрет
/// переноса отсечки в прошлое после старта и запрет изменений после заморозки.
@Injectable()
export class GiveawayAdminSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: GiveawaySettingsService,
    private readonly audit: GiveawayAdminAuditService,
  ) {}

  private async frozen(): Promise<boolean> {
    return (
      (await this.prisma.giveawayDraw.findUnique({
        where: { context: 'live' },
        select: { id: true },
      })) !== null
    );
  }

  async get(now: Date = new Date()) {
    const s = await this.settings.get();
    return {
      ...this.settings.describe(s),
      started: now.getTime() >= s.startAt.getTime(),
      drawFrozen: await this.frozen(),
    };
  }

  async patch(
    patch: GiveawaySettingsPatch,
    actor: string,
    now: Date = new Date(),
  ) {
    if (await this.frozen()) throw conflict('draw_frozen');
    const cur = await this.settings.get();
    const started = now.getTime() >= cur.startAt.getTime();
    if (
      started &&
      patch.cutoffAt !== undefined &&
      patch.cutoffAt.getTime() < now.getTime()
    ) {
      throw badRequest('cutoff_in_past');
    }
    try {
      await this.settings.update(patch, now);
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw badRequest(err.message);
      }
      throw err;
    }
    await this.audit.record({
      actor,
      action: 'settings_update',
      objectType: 'settings',
      mode: 'live',
      detail: Object.keys(patch)
        .filter((k) => (patch as Record<string, unknown>)[k] !== undefined)
        .join(','),
    });
    return this.get(now);
  }
}
