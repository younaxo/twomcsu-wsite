/// Устойчивость демо-сида к частичным ошибкам: каждый блок выполняется в
/// отдельном try; сбой блока даёт предупреждение (без текста ошибки с данными
/// подключения, только сообщение), остальные блоки продолжаются.
export interface BlockReport {
  applied: string[];
  skipped: string[];
}

export const newBlockReport = (): BlockReport => ({ applied: [], skipped: [] });

/// Блок может вернуть `{ skip: причина }` — осознанный пропуск (без ошибки).
export type BlockResult = void | { skip: string };

export async function runBlock(
  report: BlockReport,
  name: string,
  fn: () => Promise<BlockResult>,
): Promise<void> {
  try {
    const res = await fn();
    if (res && typeof res === 'object' && 'skip' in res) {
      console.warn(`Демо-сид: блок «${name}» пропущен: ${res.skip}`);
      report.skipped.push(name);
      return;
    }
    report.applied.push(name);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`Демо-сид: блок «${name}» пропущен из-за ошибки: ${msg}`);
    report.skipped.push(name);
  }
}

export const formatBlockReport = (report: BlockReport): string =>
  `применено: ${report.applied.join(', ') || 'нет'}; пропущено: ${report.skipped.join(', ') || 'нет'}`;
