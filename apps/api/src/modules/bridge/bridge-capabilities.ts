import { BridgeCapability, CAPABILITY_KEYS } from './bridge.constants';

/// Возможности сервера (2.4 контракта). Правила (допущение при неоднозначности
/// «непустого объекта без `punishments`»: минимальные права):
///  - NULL, не объект, массив или объект без ни одного известного ключа —
///    минимум по умолчанию `{punishments}`;
///  - иначе действуют только известные ключи со значением строго `true`
///    (`punishments: false` отключает наказания);
///  - неизвестные ключи игнорируются и права не расширяют.
export function resolveCapabilities(
  raw: unknown,
): ReadonlySet<BridgeCapability> {
  const defaults = new Set<BridgeCapability>(['punishments']);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaults;
  }
  const obj = raw as Record<string, unknown>;
  const known = CAPABILITY_KEYS.filter((k) =>
    Object.prototype.hasOwnProperty.call(obj, k),
  );
  if (known.length === 0) return defaults;
  return new Set(known.filter((k) => obj[k] === true));
}
