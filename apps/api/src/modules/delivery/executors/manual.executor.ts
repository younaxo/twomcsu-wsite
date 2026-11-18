import { Injectable } from '@nestjs/common';
import {
  DeliveryExecutor,
  DeliveryResult,
  DeliveryTaskSnapshot,
} from '../delivery-executor.interface';
import { EXECUTOR_MANUAL } from '../delivery.constants';

/// Ручная выдача: задание ждёт, админ отмечает «выдано» (ADR-0184 п. 2).
/// Исполнитель по умолчанию: без явного выбора ничего не уходит на сервер.
/// Воркер задания `manual` не берёт (automatic = false).
@Injectable()
export class ManualExecutor implements DeliveryExecutor {
  readonly kind = EXECUTOR_MANUAL;
  readonly idempotent = true;
  readonly automatic = false;

  execute(_task: DeliveryTaskSnapshot): Promise<DeliveryResult> {
    return Promise.resolve({ kind: 'awaiting_manual' });
  }
}
