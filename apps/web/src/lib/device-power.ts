/// Множитель для слабых устройств: экономия трафика — 0.4, ≤ 4 ядер или
/// ≤ 4 ГБ памяти — 0.5, иначе 1.
export function devicePowerFactor(
  nav: Pick<Navigator, 'hardwareConcurrency'> & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  },
): number {
  if (nav.connection?.saveData) return 0.4;
  const weak = (nav.hardwareConcurrency || 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
  return weak ? 0.5 : 1;
}
