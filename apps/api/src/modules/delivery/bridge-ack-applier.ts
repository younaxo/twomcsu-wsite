import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  BridgeDeliveryService,
  JobSnapshot,
} from '../bridge/bridge-delivery.service';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryService } from './delivery.service';
import { BridgeExecutor } from './executors/bridge.executor';
import { sanitizeDeliveryError } from './delivery-status';

/// Переносит исход, подтверждённый плагином, в задание выдачи (0.13, ADR-0194).
/// Основной путь — исполнитель сам читает исход, пока ждёт. Этот слушатель
/// нужен для позднего ack: задание уже ушло в NEEDS_ATTENTION по тайм-ауту, а
/// сервер потом подтвердил выдачу. Применение идёт через `applyResult` с
/// токеном аренды последней попытки: принимаются только `delivered` и `failed`
/// и только для той же попытки, что породила задание Bridge.
@Injectable()
export class BridgeAckApplier implements OnModuleInit {
  private readonly logger = new Logger(BridgeAckApplier.name);

  constructor(
    private readonly bridge: BridgeDeliveryService,
    private readonly executor: BridgeExecutor,
    private readonly delivery: DeliveryService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.bridge.onSettled(async (job) => {
      await this.apply(job);
    });
  }

  async apply(job: JobSnapshot): Promise<boolean> {
    const result = this.executor.toResult(job);
    if (result === null) return false;
    const task = await this.prisma.deliveryTask.findUnique({
      where: { id: job.taskId },
      select: { leaseToken: true, attempts: true },
    });
    if (task === null || task.leaseToken === null) return false;
    // Исход чужой (более ранней) попытки задание не меняет.
    if (task.attempts !== job.attempt) {
      this.logger.warn(
        `Bridge ack пропущен: попытка ${job.attempt} != ${task.attempts}, task=${job.taskId}`,
      );
      return false;
    }
    try {
      return await this.delivery.applyResult(
        job.taskId,
        task.leaseToken,
        result,
      );
    } catch (error) {
      this.logger.warn(
        `Bridge ack не применён: task=${job.taskId} ${sanitizeDeliveryError(error)}`,
      );
      return false;
    }
  }
}
