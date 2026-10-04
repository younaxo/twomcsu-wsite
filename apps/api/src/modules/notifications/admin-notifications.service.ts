import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';
import { DiscordService } from './discord.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class AdminNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly discord: DiscordService,
  ) {}

  async broadcast(dto: BroadcastNotificationDto): Promise<{ count: number }> {
    const type = (dto.type ?? 'ANNOUNCEMENT') as NotificationType;
    const targetIds =
      dto.userIds && dto.userIds.length > 0
        ? dto.userIds
        : (await this.prisma.user.findMany({ select: { id: true } })).map(
            (u) => u.id,
          );

    await Promise.all(
      targetIds.map((userId) =>
        this.notifications.create({
          userId,
          type,
          title: dto.title,
          message: dto.message,
          link: dto.link,
          priority: dto.priority,
        }),
      ),
    );

    await this.discord.broadcastToSystemWebhooks(
      type,
      dto.message ? `**${dto.title}**\n${dto.message}` : `**${dto.title}**`,
    );

    return { count: targetIds.length };
  }

  async stats() {
    const [total, unread, byType] = await Promise.all([
      this.prisma.notification.count(),
      this.prisma.notification.count({ where: { isRead: false } }),
      this.prisma.notification.groupBy({
        by: ['type'],
        _count: { type: true },
      }),
    ]);
    return {
      total,
      unread,
      byType: Object.fromEntries(
        byType.map((row) => [row.type, row._count.type]),
      ),
    };
  }
}
