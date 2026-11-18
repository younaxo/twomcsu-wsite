import { Injectable } from '@nestjs/common';
import { DecorationGrantSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DeliveryExecutor,
  DeliveryResult,
  DeliveryTaskSnapshot,
} from '../delivery-executor.interface';
import { EXECUTOR_SITE } from '../delivery.constants';

/// Сайтовая выдача: украшение профиля по `Product.decorationId` с источником
/// PURCHASE (ADR-0184, подэтап 0.7). Бейджи отложены владельцем (Q41) и не
/// выдаются. Выдача идемпотентна: UNIQUE (userId, decorationId); если
/// украшение уже есть (в том числе от админа), запись не меняется.
@Injectable()
export class SiteExecutor implements DeliveryExecutor {
  readonly kind = EXECUTOR_SITE;
  readonly idempotent = true;
  readonly automatic = true;

  constructor(private readonly prisma: PrismaService) {}

  async execute(task: DeliveryTaskSnapshot): Promise<DeliveryResult> {
    if (!task.decorationId) {
      return { kind: 'failed', reason: 'decoration_missing' };
    }
    if (!task.recipientUserId) {
      // Гостевой заказ: аккаунта-получателя нет, выдавать некому.
      return { kind: 'failed', reason: 'recipient_not_registered' };
    }
    const decoration = await this.prisma.profileDecoration.findUnique({
      where: { id: task.decorationId },
      select: { id: true },
    });
    if (!decoration) {
      return { kind: 'failed', reason: 'decoration_missing' };
    }
    const user = await this.prisma.user.findUnique({
      where: { id: task.recipientUserId },
      select: { id: true },
    });
    if (!user) {
      return { kind: 'failed', reason: 'recipient_not_found' };
    }
    await this.prisma.userDecoration.upsert({
      where: {
        userId_decorationId: {
          userId: task.recipientUserId,
          decorationId: task.decorationId,
        },
      },
      create: {
        userId: task.recipientUserId,
        decorationId: task.decorationId,
        source: DecorationGrantSource.PURCHASE,
        orderId: task.orderId,
      },
      update: {},
    });
    return { kind: 'delivered' };
  }
}
