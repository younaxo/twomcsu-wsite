import { DeliveryTaskStatus } from '@prisma/client';

/// Настройка сайта (БД): доставка включена. По умолчанию выключена (ADR-0184 Р10).
export const DELIVERY_ENABLED_SETTING = 'store.delivery.enabled';
/// Настройка: исполнитель `command` включён (по умолчанию нет, ADR-0184 п. 9).
export const DELIVERY_COMMAND_ENABLED_SETTING =
  'store.delivery.executor.command.enabled';
/// Настройка: потолок попыток (по умолчанию 5, ADR-0184 п. 5).
export const DELIVERY_MAX_ATTEMPTS_SETTING = 'store.delivery.maxAttempts';
/// Жёсткий запрет через окружение: если явно false, доставка выключена
/// независимо от настройки (ADR-0184 Р10, допущение 13, Q80).
export const DELIVERY_ENV_FLAG = 'STORE_DELIVERY_ENABLED';

/// Кэш чтения настроек доставки: не более 30 секунд (ADR-0184 Р10).
export const DELIVERY_SETTINGS_CACHE_MS = 30_000;
export const DELIVERY_DEFAULT_MAX_ATTEMPTS = 5;
/// Паузы между повторами: 1, 5, 30 минут, затем 2 часа (ADR-0184 п. 5).
export const DELIVERY_BACKOFF_MS: readonly number[] = [
  60_000, 300_000, 1_800_000, 7_200_000,
];
/// Тайм-аут исполнителя; аренда строго длиннее на запас (ADR-0184 Р6).
export const DELIVERY_EXECUTOR_TIMEOUT_MS = 15_000;
export const DELIVERY_LEASE_MARGIN_MS = 30_000;
export const DELIVERY_POLL_INTERVAL_MS = 15_000;
export const DELIVERY_BATCH_SIZE = 10;

export const EXECUTOR_MANUAL = 'manual';
export const EXECUTOR_SITE = 'site';
export const EXECUTOR_COMMAND = 'command';

/// Возврат запрещён, если любое задание позиции в этих статусах (ADR-0184 Р4).
export const REFUND_BLOCKING_STATUSES: readonly DeliveryTaskStatus[] = [
  DeliveryTaskStatus.DELIVERED,
  DeliveryTaskStatus.MANUAL_DONE,
  DeliveryTaskStatus.IN_PROGRESS,
  DeliveryTaskStatus.NEEDS_ATTENTION,
];

/// Задание считается выданным.
export const DONE_STATUSES: readonly DeliveryTaskStatus[] = [
  DeliveryTaskStatus.DELIVERED,
  DeliveryTaskStatus.MANUAL_DONE,
];

/// Из каких статусов админ может отметить «выдано вручную».
export const MANUAL_DONE_FROM: readonly DeliveryTaskStatus[] = [
  DeliveryTaskStatus.PENDING,
  DeliveryTaskStatus.RETRY_WAIT,
  DeliveryTaskStatus.AWAITING_MANUAL,
  DeliveryTaskStatus.NEEDS_ATTENTION,
  DeliveryTaskStatus.FAILED,
];

/// Из каких статусов возможен ручной повтор.
export const RETRY_FROM: readonly DeliveryTaskStatus[] = [
  DeliveryTaskStatus.FAILED,
  DeliveryTaskStatus.NEEDS_ATTENTION,
];
