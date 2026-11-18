import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  COMMAND_TRANSPORT,
  CommandNotSentError,
  CommandTransport,
  DeliveryExecutor,
  DeliveryResult,
  DeliveryTaskSnapshot,
} from '../delivery-executor.interface';
import { EXECUTOR_COMMAND } from '../delivery.constants';
import { isDeliverableNick } from '../delivery-nick';
import { sanitizeDeliveryError } from '../delivery-status';

/// Исполнитель «команда на сервер» (ADR-0184 п. 2, 6). Отправляет ТОЛЬКО
/// `renderedCommand` из задания (Р3); шаблонов и `Product.gameCommands` не
/// читает (Р1). В 0.7 шаблонов нет, поэтому у заданий `renderedCommand = null`
/// и исполнитель отвечает `failed: no_command` без отправки. Транспорта в
/// проекте нет: без него сбой считается «до отправки» (`retry`).
@Injectable()
export class CommandExecutor implements DeliveryExecutor {
  readonly kind = EXECUTOR_COMMAND;
  /// Повтор команды после неизвестного исхода может выдать товар дважды.
  readonly idempotent = false;
  readonly automatic = true;

  constructor(
    @Optional()
    @Inject(COMMAND_TRANSPORT)
    private readonly transport?: CommandTransport,
  ) {}

  async execute(task: DeliveryTaskSnapshot): Promise<DeliveryResult> {
    if (!task.renderedCommand) {
      return { kind: 'failed', reason: 'no_command' };
    }
    // Р9: ник повторно проверяется при отправке.
    if (!isDeliverableNick(task.nick)) {
      return { kind: 'failed', reason: 'invalid_nick' };
    }
    if (!this.transport) {
      return { kind: 'retry', reason: 'transport_disabled' };
    }
    try {
      const ack = await this.transport.send(task.renderedCommand, {
        idempotencyKey: task.idempotencyKey,
      });
      return { kind: 'delivered', externalRef: ack.ref };
    } catch (error) {
      if (error instanceof CommandNotSentError) {
        return { kind: 'retry', reason: sanitizeDeliveryError(error) };
      }
      // Тайм-аут, разрыв до ответа, любая иная ошибка: команда могла уйти.
      return { kind: 'unknown', reason: sanitizeDeliveryError(error) };
    }
  }
}
