import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { BroadcastDto } from './dto/broadcast.dto';
import { UpsertSettingsDto } from './dto/upsert-settings.dto';

const ONLINE_WINDOW_MINUTES = 5;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async getDashboard() {
    const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MINUTES * 60_000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      onlineUsers,
      bannedUsers,
      newUsersToday,
      pendingReports,
      pendingCommentReports,
      pendingProfileReports,
      recentAuditLog,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: { lastActivityAt: { gte: onlineSince } },
      }),
      this.prisma.user.count({ where: { isBanned: true } }),
      this.prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.report.count({ where: { status: 'PENDING' } }),
      this.prisma.commentReport.count({ where: { status: 'PENDING' } }),
      this.prisma.profileReport.count({ where: { status: 'PENDING' } }),
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { actor: { select: { id: true, username: true } } },
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        online: onlineUsers,
        banned: bannedUsers,
        newToday: newUsersToday,
      },
      moderation: {
        pendingReports,
        pendingCommentReports,
        pendingProfileReports,
      },
      recentAuditLog,
    };
  }

  /// Рассылка Announcement + fan-out уведомлений ANNOUNCEMENT. Как и
  /// AchievementProgressService.checkAllUsers — O(n) по целевым
  /// пользователям, admin-triggered, без очереди/cron (PHASE 29).
  async broadcast(dto: BroadcastDto, createdBy: string) {
    const announcement = await this.prisma.announcement.create({
      data: {
        title: dto.title,
        message: dto.message,
        type: dto.type ?? 'info',
        link: dto.link,
        isDismissible: dto.isDismissible ?? true,
        showUntil: dto.showUntil ? new Date(dto.showUntil) : undefined,
        targetRole: dto.targetRole,
        createdBy,
      },
    });

    const targets = await this.prisma.user.findMany({
      where: dto.targetRole
        ? { roles: { some: { role: { name: dto.targetRole } } } }
        : {},
      select: { id: true },
    });

    let delivered = 0;
    for (const user of targets) {
      const notification = await this.notifications.create({
        userId: user.id,
        type: NotificationType.ANNOUNCEMENT,
        title: dto.title,
        message: dto.message,
        link: dto.link,
      });
      if (notification) {
        delivered += 1;
      }
    }

    await this.audit.log({
      actorId: createdBy,
      action: 'notification.broadcast',
      targetType: 'Announcement',
      targetId: announcement.id,
      changes: { title: dto.title, targetRole: dto.targetRole ?? null },
    });

    return { announcement, usersTargeted: targets.length, delivered };
  }

  async getSettings(): Promise<Record<string, string>> {
    const rows = await this.prisma.siteSetting.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async upsertSettings(dto: UpsertSettingsDto, actorId: string) {
    const before = await this.getSettings();
    await Promise.all(
      Object.entries(dto.settings).map(([key, value]) =>
        this.prisma.siteSetting.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        }),
      ),
    );
    const after = await this.getSettings();

    await this.audit.log({
      actorId,
      action: 'settings.update',
      targetType: 'SiteSetting',
      changes: { before, after },
    });

    return after;
  }
}
