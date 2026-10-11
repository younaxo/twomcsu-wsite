import { Logger } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import type { NotificationsService } from '../notifications/notifications.service';

const logger = new Logger('AchievementNotify');

/// Уведомление «Новое достижение» (ADR-0137): на сайте — тост и колокольчик,
/// ссылка ведёт на карточку достижения. Сбой уведомления не отменяет выдачу.
export async function notifyAchievementUnlocked(
  notifications: NotificationsService,
  userId: string,
  achievement: { name: string; slug: string },
): Promise<void> {
  try {
    await notifications.create({
      userId,
      type: NotificationType.ACHIEVEMENT_UNLOCKED,
      title: 'Новое достижение',
      message: achievement.name,
      link: `/achievements/${encodeURIComponent(achievement.slug)}`,
    });
  } catch (error) {
    logger.warn(
      `Не удалось отправить уведомление о достижении: ${(error as Error).message}`,
    );
  }
}
