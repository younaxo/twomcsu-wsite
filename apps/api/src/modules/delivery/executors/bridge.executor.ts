import { Injectable } from '@nestjs/common';
import { BridgeDeliveryJobStatus } from '@prisma/client';
import {
  BridgeDeliveryService,
  JobSnapshot,
} from '../../bridge/bridge-delivery.service';
import { DELIVERY_SERVER_LIVENESS_MS } from '../../bridge/bridge.constants';
import {
  CommandTemplateError,
  validateRenderedCommand,
} from '../command-template';
import {
  DeliveryExecutor,
  DeliveryResult,
  DeliveryTaskSnapshot,
} from '../delivery-executor.interface';
import { isDeliverableNick } from '../delivery-nick';
import { EXECUTOR_BRIDGE } from '../delivery.constants';
import { sanitizeDeliveryError } from '../delivery-status';

/// Исполнитель `bridge` (0.13, ADR-0184 п. 2, ADR-0194): кладёт проверенную
/// команду в очередь заданий Bridge и ждёт подтверждения сервера в пределах
/// `timing.ackWaitMs` (меньше тайм-аута исполнителя сервиса).
///
/// Исходы:
///  - `done` от сервера -> delivered;
///  - `failed` -> failed (с кодом причины); `unknown` -> unknown;
///  - сервер недоступен ДО постановки, либо задание так и не захвачено к
///    дедлайну (отменяется атомарно, плагин его уже не получит) -> retry
///    (известно, что команда НЕ ушла);
///  - задание захвачено, подтверждения нет -> unknown: БЕЗ автоповтора;
///    дальше только ручная проверка админом; поздний ack переносится в
///    задание слушателем (`BridgeAckApplier`), повтор только явным действием.
/// Шаблонов и `Product.gameCommands` не читает: только `renderedCommand`.
@Injectable()
export class BridgeExecutor implements DeliveryExecutor {
  readonly kind = EXECUTOR_BRIDGE;
  /// Повтор после неизвестного исхода может выдать товар дважды.
  readonly idempotent = false;
  readonly automatic = true;

  /// Тайминги; изменяются тестами.
  readonly timing = {
    ackWaitMs: 10_000,
    pollMs: 250,
    livenessMs: DELIVERY_SERVER_LIVENESS_MS,
    /// Запас жизни задания в очереди сверх ожидания.
    queueSlackMs: 20_000,
  };

  constructor(private readonly bridge: BridgeDeliveryService) {}

  operational(): boolean {
    return this.bridge.isOperational();
  }

  async execute(task: DeliveryTaskSnapshot): Promise<DeliveryResult> {
    if (!task.renderedCommand) return { kind: 'failed', reason: 'no_command' };
    if (!isDeliverableNick(task.nick)) {
      return { kind: 'failed', reason: 'invalid_nick' };
    }
    if (!task.bridge) return { kind: 'failed', reason: 'bridge_no_target' };
    try {
      validateRenderedCommand(
        task.renderedCommand,
        task.bridge.extraCommandRoots,
      );
    } catch (error) {
      if (error instanceof CommandTemplateError) {
        return { kind: 'failed', reason: `command_${error.code}` };
      }
      throw error;
    }
    if (!this.bridge.isOperational()) {
      return { kind: 'retry', reason: 'bridge_disabled' };
    }
    // Сервер недоступен: команда не ставится в очередь, исход известен.
    const state = await this.bridge.serverState(
      task.bridge.serverSlug,
      this.timing.livenessMs,
    );
    if (state !== 'ok') {
      // Неверная настройка (нет сервера, отключён, нет права) повторами не
      // лечится, но и не теряет заказ: ждёт в RETRY_WAIT, затем FAILED.
      return { kind: 'retry', reason: `bridge_server_${state}` };
    }

    const job = await this.bridge.enqueue({
      idempotencyKey: task.idempotencyKey,
      taskId: task.taskId,
      attempt: task.attempt,
      serverSlug: task.bridge.serverSlug,
      command: task.renderedCommand,
      ttlMs: this.timing.ackWaitMs + this.timing.queueSlackMs,
    });
    const settled = this.toResult(job);
    if (settled) return settled;
    if (job.status === BridgeDeliveryJobStatus.CLAIMED) {
      // Параллельный запуск уже передал задание плагину.
      return { kind: 'unknown', reason: 'bridge_claim_in_flight' };
    }

    const deadline = Date.now() + this.timing.ackWaitMs;
    for (;;) {
      await sleep(this.timing.pollMs);
      const current = await this.bridge.getById(job.id);
      if (current === null)
        return { kind: 'unknown', reason: 'bridge_job_lost' };
      const result = this.toResult(current);
      if (result) return result;
      if (Date.now() < deadline) continue;
      if (current.status === BridgeDeliveryJobStatus.QUEUED) {
        // Не захвачено: отмена атомарна, плагин уже не получит команду.
        if (await this.bridge.cancelIfQueued(job.id)) {
          return { kind: 'retry', reason: 'bridge_not_claimed' };
        }
        // Захватили между чтением и отменой: читаем исход заново.
        const after = await this.bridge.getById(job.id);
        const late = after ? this.toResult(after) : null;
        if (late) return late;
      }
      return { kind: 'unknown', reason: 'bridge_ack_timeout' };
    }
  }

  /// Итоговый результат по строке задания либо null, если исхода ещё нет.
  toResult(job: JobSnapshot): DeliveryResult | null {
    switch (job.status) {
      case BridgeDeliveryJobStatus.DONE:
        return { kind: 'delivered', externalRef: `bridge:${job.serverSlug}` };
      case BridgeDeliveryJobStatus.FAILED:
        return {
          kind: 'failed',
          reason: sanitizeDeliveryError(`bridge_${job.ackCode ?? 'failed'}`),
        };
      case BridgeDeliveryJobStatus.UNKNOWN:
        return {
          kind: 'unknown',
          reason: sanitizeDeliveryError(`bridge_${job.ackCode ?? 'unknown'}`),
        };
      case BridgeDeliveryJobStatus.CANCELLED:
        return {
          kind: 'retry',
          reason: sanitizeDeliveryError(`bridge_${job.ackCode ?? 'cancelled'}`),
        };
      default:
        return null;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
