/// Параметры сборщика частей снимка (ADR-0168, раздел 4.4 дизайна; Q35).
/// Все числа — «Допущение до подтверждения владельцем (Q61, Q62)»: владелец
/// их не называл, значения настраиваются, реализация не считает их
/// окончательными. Умолчания — из дизайна.

export const INVENTORY_ASSEMBLY_CONFIG = Symbol('INVENTORY_ASSEMBLY_CONFIG');

import { EPOCH_MAX_AHEAD_MS } from './inventory-limits';

const MB = 1024 * 1024;
const KB = 1024;

export interface AssemblyConfig {
  /// Таймаут неполного комплекта `T`, мс (абсолютный от первой части). 30–600 с.
  assemblyTimeoutMs: number;
  /// Запас на расхождение часов: отсечка по `capturedAt` = `T` + запас.
  clockSkewMs: number;
  /// Единый TTL меток `done`, `evt`, `mark` (выводится из `T`).
  ttlSvcMs: number;
  /// TTL захвата применения.
  lockTtlMs: number;
  /// Размер собранного снимка (ряда), байт.
  maxAssembledBytes: number;
  /// Размер одной части, байт (лимит события Bridge 5.4).
  maxPartBytes: number;
  /// Одновременных сборок на сервер.
  maxAssembliesPerServer: number;
  /// Буфер сборок на сервер, байт (`idxb`).
  maxBufferBytesPerServer: number;
  /// Служебная память на сервер, байт (`svc`).
  maxServiceBytesPerServer: number;
  /// Потолок сервера всего (сборки + служебная память), байт.
  maxServerBytes: number;
  /// Глобальный потолок (сумма по серверам), байт.
  maxGlobalBytes: number;
  /// Не более серверов с `inventory-sync` в учёте `g`.
  maxServers: number;
  /// Снимков (создание сборки) в минуту на игрока.
  snapshotsPerMinute: number;
  /// Живых сборок на `(userId, group)`; сверх — вытесняется самая старая.
  assembliesPerPlayerGroup: number;
  /// Учёт служебных ключей снимка с запасом: 8 ключей по 256 байт.
  serviceBytesPerSnapshot: number;
  /// Служебные поля сборки сверх полезной нагрузки.
  assemblyOverheadBytes: number;
  /// `epoch` не больше «сейчас + 10 минут» (единицы — мс).
  epochMaxAheadMs: number;
  /// Тревога, если принятый `epoch` опережает часы больше чем на 120 с.
  epochAlarmAheadMs: number;
  /// Запись сервера в `g` старше `TTLsvc` + запас удаляется лениво.
  globalEntryExtraMs: number;
  /// Состояние политики Redis подтверждено владельцем явно (CONFIG GET и
  /// INFO memory недоступны по ACL: управляемый Redis). Читается ТОЛЬКО из
  /// конфигурации владельца: переменная окружения
  /// `INVENTORY_REDIS_POLICY_ACKNOWLEDGED=true`; необязательна, без значения
  /// по умолчанию `true` (fail-closed). Действует только при отказе ACL
  /// (NOPERM); любая иная ошибка проверки флаг не учитывает.
  redisPolicyAcknowledged: boolean;
}

/// `TTLsvc = max(300, ceil10(1,4 × (T + 90)))` в секундах → мс.
/// T = 120 с и T = 30 с дают 300 с, T = 600 с — 970 с.
export function deriveTtlSvcMs(assemblyTimeoutMs: number): number {
  const tSec = assemblyTimeoutMs / 1000;
  const derivedSec = Math.ceil((14 * (tSec + 90)) / 100) * 10;
  return Math.max(300, derivedSec) * 1000;
}

export const DEFAULT_ASSEMBLY_CONFIG: AssemblyConfig = {
  assemblyTimeoutMs: 120_000,
  clockSkewMs: 30_000,
  ttlSvcMs: deriveTtlSvcMs(120_000),
  lockTtlMs: 30_000,
  maxAssembledBytes: 32 * KB,
  maxPartBytes: 16 * KB,
  maxAssembliesPerServer: 256,
  maxBufferBytesPerServer: 8 * MB,
  maxServiceBytesPerServer: 12 * MB,
  maxServerBytes: 20 * MB,
  maxGlobalBytes: 64 * MB,
  maxServers: 64,
  snapshotsPerMinute: 6,
  assembliesPerPlayerGroup: 2,
  serviceBytesPerSnapshot: 2 * KB,
  assemblyOverheadBytes: 1 * KB,
  epochMaxAheadMs: EPOCH_MAX_AHEAD_MS,
  epochAlarmAheadMs: 120 * 1000,
  globalEntryExtraMs: 30_000,
  redisPolicyAcknowledged: false,
};

/// Флаг подтверждения политики Redis из окружения владельца: только строка
/// `true` (без учёта регистра); пусто, не задано, любое иное — `false`.
export function redisPolicyAcknowledgedFromEnv(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (
    (env.INVENTORY_REDIS_POLICY_ACKNOWLEDGED ?? '').trim().toLowerCase() ===
    'true'
  );
}

/// Собирает и проверяет конфигурацию. `ttlSvcMs`, если не задан, выводится из
/// `assemblyTimeoutMs`. Приёмник отказывается запускать сборку при
/// `TTLsvc < T + 90 с` (раздел 4.4): окно повтора не должно вернуться.
export function resolveAssemblyConfig(
  overrides: Partial<AssemblyConfig> = {},
): AssemblyConfig {
  const timeout =
    overrides.assemblyTimeoutMs ?? DEFAULT_ASSEMBLY_CONFIG.assemblyTimeoutMs;
  if (!Number.isInteger(timeout) || timeout < 30_000 || timeout > 600_000) {
    throw new Error('assemblyTimeoutMs: допустимо 30000-600000 мс');
  }
  const config: AssemblyConfig = {
    ...DEFAULT_ASSEMBLY_CONFIG,
    ...overrides,
    redisPolicyAcknowledged:
      overrides.redisPolicyAcknowledged ?? redisPolicyAcknowledgedFromEnv(),
    assemblyTimeoutMs: timeout,
    ttlSvcMs: overrides.ttlSvcMs ?? deriveTtlSvcMs(timeout),
  };
  if (config.ttlSvcMs < timeout + 90_000) {
    throw new Error('ttlSvcMs меньше assemblyTimeoutMs + 90 с: окно повтора');
  }
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'number' && (!Number.isFinite(value) || value <= 0)) {
      throw new Error(`${key}: положительное число`);
    }
  }
  return config;
}

/// Отсечка по `capturedAt` для части, создающей новую сборку: `T` + запас.
export function cutoffMs(config: AssemblyConfig): number {
  return config.assemblyTimeoutMs + config.clockSkewMs;
}

/// Справедливая доля сервера: `L(N) = min(20 МБ, floor(64 МБ / N))`, `N` не
/// больше `maxServers` (раздел 4.4, «Память Redis»). Сумма долей не больше
/// глобального потолка по построению.
export function serverShareBytes(
  serverCount: number,
  config: AssemblyConfig,
): number {
  const n = Math.min(Math.max(1, serverCount), config.maxServers);
  return Math.min(config.maxServerBytes, Math.floor(config.maxGlobalBytes / n));
}
