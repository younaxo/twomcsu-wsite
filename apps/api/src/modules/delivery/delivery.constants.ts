import { DeliveryTaskStatus } from '@prisma/client';

/// Настройка сайта (БД): доставка включена. По умолчанию выключена (ADR-0184 Р10).
export const DELIVERY_ENABLED_SETTING = 'store.delivery.enabled';
/// Настройка: исполнитель `command` включён (по умолчанию нет, ADR-0184 п. 9).
export const DELIVERY_COMMAND_ENABLED_SETTING =
  'store.delivery.executor.command.enabled';
/// Настройка: исполнитель `bridge` включён (0.13, по умолчанию нет). Помимо
/// неё нужны env `BRIDGE_ENABLED`, `BRIDGE_DELIVERY_ENABLED` и ключи серверов.
export const DELIVERY_BRIDGE_ENABLED_SETTING =
  'store.delivery.executor.bridge.enabled';
/// Настройка: slug игрового сервера Bridge, на который идут задания (0.13).
export const DELIVERY_BRIDGE_SERVER_SETTING =
  'store.delivery.bridge.serverSlug';
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

/// Env `DELIVERY_RECONCILE_ENABLED`: явный false выключает фоновую сверку.
export const DELIVERY_RECONCILE_ENV_FLAG = 'DELIVERY_RECONCILE_ENABLED';
/// Период фоновой сверки заданий выдачи.
export const DELIVERY_RECONCILE_INTERVAL_MS = 60_000;
/// Размер пачки сверки (заказов за проход).
export const DELIVERY_RECONCILE_BATCH_SIZE = 50;
/// Заказ моложе этого не трогаем: шаг после коммита вебхука ещё может идти.
export const DELIVERY_RECONCILE_GRACE_MS = 60_000;
/// Окно сверки: старше не досоздаём (защита от выдачи по историческим заказам
/// до 0.7, у которых заданий нет намеренно).
export const DELIVERY_RECONCILE_LOOKBACK_MS = 72 * 3_600_000;

export const EXECUTOR_MANUAL = 'manual';
export const EXECUTOR_SITE = 'site';
export const EXECUTOR_COMMAND = 'command';
/// Зачисление рубинов на кошелёк (0.15, ADR-0191).
export const EXECUTOR_WALLET = 'wallet';
/// Выдача через плагин Bridge с подтверждением сервера (0.13, ADR-0194).
export const EXECUTOR_BRIDGE = 'bridge';

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
