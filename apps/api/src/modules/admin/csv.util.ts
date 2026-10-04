import { Response } from 'express';
import type { ExportResult } from './export.service';

/// Отдаёт CSV напрямую в HTTP-ответ (без файлового хранилища — PHASE 23).
export function sendCsv(res: Response, result: ExportResult): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${result.filename}"`,
  );
  res.send(result.csv);
}

/// Минимальный RFC4180-совместимый CSV-сериализатор (без внешней
/// зависимости — формат простой, остальная кодовая база уже предпочитает
/// hand-rolled реализацию внешней библиотеке там, где протокол тривиален).
export function toCsv(
  rows: Record<string, unknown>[],
  columns: string[],
): string {
  const escapeCell = (value: unknown): string => {
    if (value === null || value === undefined) {
      return '';
    }
    const str = value instanceof Date ? value.toISOString() : String(value);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = columns.map(escapeCell).join(',');
  const lines = rows.map((row) =>
    columns.map((col) => escapeCell(row[col])).join(','),
  );
  return [header, ...lines].join('\r\n');
}
