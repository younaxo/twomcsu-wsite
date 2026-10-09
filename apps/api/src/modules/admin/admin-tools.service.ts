import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SEASONAL_CAMPAIGN_IDS,
  UpdateSeasonalDto,
} from './dto/update-seasonal.dto';
import { Prisma } from '@prisma/client';
import { svgProblems } from '../../common/svg-safety.util';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { BookmarkDto } from './dto/bookmark.dto';
import { IpWhitelistDto } from './dto/ip-whitelist.dto';
import { ReorderBookmarksDto } from './dto/reorder-bookmarks.dto';
import { SavedFilterDto } from './dto/saved-filter.dto';
import { ScheduledExportDto } from './dto/scheduled-export.dto';
import { UpdateBookmarkDto } from './dto/update-bookmark.dto';
import { UpdateSavedFilterDto } from './dto/update-saved-filter.dto';
import { UpdateScheduledExportDto } from './dto/update-scheduled-export.dto';
import { UpdateSiteAlertDto } from './dto/update-site-alert.dto';
import { UpdateSiteSettingsDto } from './dto/update-site-settings.dto';
import { UserIdFilterQueryDto } from './dto/user-id-filter-query.dto';

@Injectable()
export class AdminToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  // --- Saved filters (персональные, per-admin) ---------------------------

  async listSavedFilters(userId: string, page?: string) {
    return this.prisma.savedFilter.findMany({
      where: { userId, ...(page ? { page } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createSavedFilter(userId: string, dto: SavedFilterDto) {
    return this.prisma.savedFilter.create({
      data: {
        userId,
        name: dto.name,
        page: dto.page,
        filters: dto.filters as Prisma.InputJsonValue,
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  private async requireOwnSavedFilter(id: string, userId: string) {
    const filter = await this.prisma.savedFilter.findUnique({ where: { id } });
    if (!filter) {
      throw new NotFoundException('Фильтр не найден');
    }
    if (filter.userId !== userId) {
      throw new ForbiddenException('Это не ваш сохранённый фильтр');
    }
    return filter;
  }

  async updateSavedFilter(
    id: string,
    userId: string,
    dto: UpdateSavedFilterDto,
  ) {
    await this.requireOwnSavedFilter(id, userId);
    return this.prisma.savedFilter.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.page !== undefined ? { page: dto.page } : {}),
        ...(dto.filters !== undefined
          ? { filters: dto.filters as Prisma.InputJsonValue }
          : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      },
    });
  }

  async deleteSavedFilter(id: string, userId: string) {
    await this.requireOwnSavedFilter(id, userId);
    await this.prisma.savedFilter.delete({ where: { id } });
    return { success: true };
  }

  // --- Bookmarks (персональные, per-admin) --------------------------------

  async listBookmarks(userId: string) {
    return this.prisma.adminBookmark.findMany({
      where: { userId },
      orderBy: { order: 'asc' },
    });
  }

  async createBookmark(userId: string, dto: BookmarkDto) {
    const maxOrder = await this.prisma.adminBookmark.aggregate({
      where: { userId },
      _max: { order: true },
    });
    return this.prisma.adminBookmark.create({
      data: {
        userId,
        url: dto.url,
        title: dto.title,
        icon: dto.icon,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
  }

  private async requireOwnBookmark(id: string, userId: string) {
    const bookmark = await this.prisma.adminBookmark.findUnique({
      where: { id },
    });
    if (!bookmark) {
      throw new NotFoundException('Закладка не найдена');
    }
    if (bookmark.userId !== userId) {
      throw new ForbiddenException('Это не ваша закладка');
    }
    return bookmark;
  }

  async updateBookmark(id: string, userId: string, dto: UpdateBookmarkDto) {
    await this.requireOwnBookmark(id, userId);
    return this.prisma.adminBookmark.update({ where: { id }, data: dto });
  }

  async deleteBookmark(id: string, userId: string) {
    await this.requireOwnBookmark(id, userId);
    await this.prisma.adminBookmark.delete({ where: { id } });
    return { success: true };
  }

  async reorderBookmarks(userId: string, dto: ReorderBookmarksDto) {
    const owned = await this.prisma.adminBookmark.findMany({
      where: { userId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((b) => b.id));
    const targetIds = dto.ids.filter((id) => ownedIds.has(id));
    await this.prisma.$transaction(
      targetIds.map((id, index) =>
        this.prisma.adminBookmark.update({
          where: { id },
          data: { order: index },
        }),
      ),
    );
    return this.listBookmarks(userId);
  }

  // --- Scheduled exports (персональные, per-admin) ------------------------

  async listScheduledExports(userId: string) {
    return this.prisma.scheduledExport.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createScheduledExport(userId: string, dto: ScheduledExportDto) {
    return this.prisma.scheduledExport.create({
      data: {
        userId,
        name: dto.name,
        page: dto.page,
        format: dto.format,
        filters: dto.filters as Prisma.InputJsonValue | undefined,
        schedule: dto.schedule,
        email: dto.email,
        isActive: dto.isActive ?? true,
      },
    });
  }

  private async requireOwnScheduledExport(id: string, userId: string) {
    const exp = await this.prisma.scheduledExport.findUnique({
      where: { id },
    });
    if (!exp) {
      throw new NotFoundException('Запланированный экспорт не найден');
    }
    if (exp.userId !== userId) {
      throw new ForbiddenException('Это не ваш запланированный экспорт');
    }
    return exp;
  }

  async updateScheduledExport(
    id: string,
    userId: string,
    dto: UpdateScheduledExportDto,
  ) {
    await this.requireOwnScheduledExport(id, userId);
    return this.prisma.scheduledExport.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.page !== undefined ? { page: dto.page } : {}),
        ...(dto.format !== undefined ? { format: dto.format } : {}),
        ...(dto.filters !== undefined
          ? { filters: dto.filters as Prisma.InputJsonValue }
          : {}),
        ...(dto.schedule !== undefined ? { schedule: dto.schedule } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async deleteScheduledExport(id: string, userId: string) {
    await this.requireOwnScheduledExport(id, userId);
    await this.prisma.scheduledExport.delete({ where: { id } });
    return { success: true };
  }

  // --- Структурированные настройки сайта (singleton) ----------------------

  private async getOrCreateSiteSettings() {
    const existing = await this.prisma.siteSettings.findFirst();
    if (existing) {
      return existing;
    }
    return this.prisma.siteSettings.create({ data: {} });
  }

  async getSiteSettings() {
    return this.getOrCreateSiteSettings();
  }

  // --- Глобальная плашка (ADR-0066) -------------------------------------------

  async getSiteAlert() {
    return this.prisma.siteAlert.upsert({
      where: { id: 'global' },
      create: { id: 'global' },
      update: {},
    });
  }

  /// Для админки: плюс ник того, кто менял плашку последним.
  async getSiteAlertForAdmin() {
    const alert = await this.getSiteAlert();
    const author = alert.updatedBy
      ? await this.prisma.user.findUnique({
          where: { id: alert.updatedBy },
          select: { username: true },
        })
      : null;
    return { ...alert, updatedByUsername: author?.username ?? null };
  }

  /// Плашка для публичных настроек: только включённая и с текстом.
  async getPublicSiteAlert() {
    const alert = await this.prisma.siteAlert.findUnique({
      where: { id: 'global' },
    });
    if (!alert || !alert.enabled || alert.message.trim() === '') {
      return null;
    }
    // Расписание — по серверному времени.
    const now = new Date();
    if (
      (alert.startsAt && alert.startsAt > now) ||
      (alert.endsAt && alert.endsAt <= now)
    ) {
      return null;
    }
    const custom =
      alert.icon === 'custom' && alert.customIcon ? alert.customIcon : null;
    return {
      variant: alert.variant,
      displayStyle: alert.displayStyle,
      icon: custom
        ? 'custom'
        : alert.icon === 'custom'
          ? 'alert-triangle'
          : alert.icon,
      customIcon: custom,
      title: alert.title,
      message: alert.message,
      linkUrl: alert.linkUrl,
      linkLabel: alert.linkLabel,
    };
  }

  /// Audit — отдельное действие на включение/выключение и на правку
  /// содержимого, в changes — только изменившиеся поля (before → after).
  async updateSiteAlert(dto: UpdateSiteAlertDto, actorId: string) {
    const current = await this.getSiteAlert();
    const next = {
      ...current,
      ...dto,
      startsAt:
        dto.startsAt === undefined
          ? current.startsAt
          : dto.startsAt
            ? new Date(dto.startsAt)
            : null,
      endsAt:
        dto.endsAt === undefined
          ? current.endsAt
          : dto.endsAt
            ? new Date(dto.endsAt)
            : null,
    };
    if (dto.customIcon) {
      const problems = svgProblems(dto.customIcon);
      if (problems.length > 0) {
        throw new BadRequestException(`SVG отклонён: ${problems.join(', ')}`);
      }
    }
    if (next.icon === 'custom' && !next.customIcon) {
      throw new BadRequestException('Для своей иконки загрузите SVG');
    }
    if (next.startsAt && next.endsAt && next.endsAt <= next.startsAt) {
      throw new BadRequestException(
        'Окончание показа должно быть позже начала',
      );
    }
    if (next.enabled && next.message.trim() === '') {
      throw new BadRequestException(
        'Нельзя включить плашку без текста сообщения',
      );
    }
    if ((next.linkUrl === null) !== (next.linkLabel === null)) {
      throw new BadRequestException('Ссылка и её подпись задаются вместе');
    }
    const updated = await this.prisma.siteAlert.update({
      where: { id: 'global' },
      data: {
        ...dto,
        startsAt: next.startsAt,
        endsAt: next.endsAt,
        updatedBy: actorId,
      },
    });

    const fields = [
      'enabled',
      'variant',
      'displayStyle',
      'icon',
      'title',
      'message',
      'linkUrl',
      'linkLabel',
    ] as const;
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of fields) {
      if (current[field] !== updated[field]) {
        diff[field] = { from: current[field], to: updated[field] };
      }
    }
    // SVG в audit не пишется целиком — только факт изменения.
    if (current.customIcon !== updated.customIcon) {
      diff.customIcon = {
        from: current.customIcon ? 'svg' : null,
        to: updated.customIcon ? 'svg' : null,
      };
    }
    for (const field of ['startsAt', 'endsAt'] as const) {
      const from = current[field]?.toISOString() ?? null;
      const to = updated[field]?.toISOString() ?? null;
      if (from !== to) diff[field] = { from, to };
    }
    if (Object.keys(diff).length > 0) {
      const toggled = 'enabled' in diff;
      await this.audit.log({
        actorId,
        action: toggled
          ? updated.enabled
            ? 'settings.alert.enable'
            : 'settings.alert.disable'
          : 'settings.alert.update',
        targetType: 'SiteAlert',
        targetId: updated.id,
        changes: diff as Prisma.InputJsonValue,
        severity: toggled ? 'warning' : 'info',
      });
    }
    return updated;
  }

  async updateSiteSettings(dto: UpdateSiteSettingsDto, actorId: string) {
    const current = await this.getOrCreateSiteSettings();
    const updated = await this.prisma.siteSettings.update({
      where: { id: current.id },
      data: { ...dto, updatedBy: actorId },
    });
    await this.audit.log({
      actorId,
      action: 'settings.site.update',
      targetType: 'SiteSettings',
      targetId: updated.id,
      changes: { before: current, after: updated },
    });
    return updated;
  }

  // --- Сезонная система (ADR-0079) -----------------------------------------

  async getSeasonalSettings() {
    return this.prisma.seasonalSettings.upsert({
      where: { id: 'global' },
      update: {},
      create: { id: 'global' },
    });
  }

  /// Для `/site/settings`: настройки + серверное время — кампанию по реестру
  /// выбирает клиент, но по времени сервера (расписание не зависит от часов
  /// браузера).
  async getPublicSeasonal() {
    const s = await this.getSeasonalSettings();
    return {
      enabled: s.enabled,
      mode: s.mode,
      forcedCampaignId: s.forcedCampaignId,
      showWordmarkO: s.showWordmarkO,
      showDecoration: s.showDecoration,
      showEffects: s.showEffects,
      showBanners: s.showBanners,
      effectIntensity: s.effectIntensity,
      campaigns: s.campaigns,
      serverTime: new Date().toISOString(),
    };
  }

  private normalizeCampaigns(input: Record<string, unknown>) {
    const out: Record<
      string,
      { enabled?: boolean; startsAt?: string | null; endsAt?: string | null }
    > = {};
    for (const [id, raw] of Object.entries(input)) {
      if (!(SEASONAL_CAMPAIGN_IDS as readonly string[]).includes(id)) {
        throw new BadRequestException(`Неизвестная кампания: ${id}`);
      }
      const value = (raw ?? {}) as Record<string, unknown>;
      const entry: {
        enabled?: boolean;
        startsAt?: string | null;
        endsAt?: string | null;
      } = {};
      if (value.enabled !== undefined) {
        if (typeof value.enabled !== 'boolean')
          throw new BadRequestException('enabled — boolean');
        entry.enabled = value.enabled;
      }
      for (const key of ['startsAt', 'endsAt'] as const) {
        const date = value[key];
        if (date === undefined || date === null || date === '') {
          if (date === null || date === '') entry[key] = null;
          continue;
        }
        if (typeof date !== 'string' || Number.isNaN(Date.parse(date))) {
          throw new BadRequestException(`${id}.${key} — некорректная дата`);
        }
        entry[key] = new Date(date).toISOString();
      }
      if (entry.startsAt && entry.endsAt && entry.startsAt >= entry.endsAt) {
        throw new BadRequestException(`${id}: начало должно быть раньше конца`);
      }
      out[id] = entry;
    }
    return out;
  }

  async updateSeasonalSettings(dto: UpdateSeasonalDto, actorId: string) {
    const before = await this.getSeasonalSettings();
    const mode = dto.mode ?? before.mode;
    const forced =
      dto.forcedCampaignId !== undefined
        ? dto.forcedCampaignId
        : before.forcedCampaignId;
    if (mode === 'forced' && !forced) {
      throw new BadRequestException(
        'Для режима «принудительно» выберите кампанию',
      );
    }
    const after = await this.prisma.seasonalSettings.update({
      where: { id: 'global' },
      data: {
        enabled: dto.enabled,
        mode: dto.mode,
        forcedCampaignId: dto.forcedCampaignId,
        showWordmarkO: dto.showWordmarkO,
        showDecoration: dto.showDecoration,
        showEffects: dto.showEffects,
        showBanners: dto.showBanners,
        effectIntensity: dto.effectIntensity,
        campaigns: dto.campaigns
          ? this.normalizeCampaigns(dto.campaigns)
          : undefined,
        updatedBy: actorId,
      },
    });
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of [
      'enabled',
      'mode',
      'forcedCampaignId',
      'showWordmarkO',
      'showDecoration',
      'showEffects',
      'showBanners',
      'effectIntensity',
      'campaigns',
    ] as const) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        changes[key] = { from: before[key], to: after[key] };
      }
    }
    await this.audit.log({
      actorId,
      action: 'settings.seasonal.update',
      targetType: 'SeasonalSettings',
      targetId: 'global',
      changes: changes as Prisma.InputJsonValue,
      severity: 'info',
    });
    return after;
  }

  async updateIpWhitelist(dto: IpWhitelistDto, actorId: string) {
    const current = await this.getOrCreateSiteSettings();
    const updated = await this.prisma.siteSettings.update({
      where: { id: current.id },
      data: { ipWhitelist: dto.ips, updatedBy: actorId },
    });
    await this.audit.log({
      actorId,
      action: 'security.ip_whitelist.update',
      targetType: 'SiteSettings',
      targetId: updated.id,
      changes: { before: current.ipWhitelist, after: updated.ipWhitelist },
      severity: 'warning',
    });
    return updated;
  }

  // --- Security -------------------------------------------------------------

  async listActiveSessions(query: UserIdFilterQueryDto) {
    return this.prisma.refreshToken.findMany({
      where: {
        revokedAt: null,
        expiresAt: { gt: new Date() },
        ...(query.userId ? { userId: query.userId } : {}),
      },
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async listLoginHistory(query: UserIdFilterQueryDto) {
    // Прокси для "истории входов": отдельного LoginAttempt/Session-лога нет
    // (честно, по схеме) — каждый успешный логин создаёт RefreshToken, это
    // реальные данные, не заглушка.
    return this.prisma.refreshToken.findMany({
      where: query.userId ? { userId: query.userId } : {},
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /// Список IP, заблокированных/подозрительных по данным BruteForceService
  /// (Redis) — честно собрано из реального рантайм-состояния, нет
  /// персистентной модели SuspiciousActivity.
  async listSuspiciousActivity() {
    const blockedIps = await this.scanKeys('bruteforce:blocked:*');
    const counterIps = await this.scanKeys('bruteforce:login:*');

    const ips = new Map<
      string,
      {
        ip: string;
        failedAttempts: number;
        isBlocked: boolean;
        blockedTtlSeconds: number | null;
      }
    >();

    for (const key of counterIps) {
      const ip = key.replace('bruteforce:login:', '');
      const count = await this.redis.client.get(key);
      ips.set(ip, {
        ip,
        failedAttempts: count ? Number(count) : 0,
        isBlocked: false,
        blockedTtlSeconds: null,
      });
    }
    for (const key of blockedIps) {
      const ip = key.replace('bruteforce:blocked:', '');
      const ttl = await this.redis.client.ttl(key);
      const existing = ips.get(ip);
      ips.set(ip, {
        ip,
        failedAttempts: existing?.failedAttempts ?? 0,
        isBlocked: true,
        blockedTtlSeconds: ttl >= 0 ? ttl : null,
      });
    }

    return [...ips.values()].sort(
      (a, b) => b.failedAttempts - a.failedAttempts,
    );
  }

  /// SCAN вместо KEYS — не блокирует Redis при большом keyspace.
  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.redis.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');
    return keys;
  }
}
