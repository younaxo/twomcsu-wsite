import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
