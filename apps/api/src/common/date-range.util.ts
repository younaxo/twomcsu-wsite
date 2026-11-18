/// Единый разбор диапазона дат для списков и экспортов (подэтап 0.4).
/// Дата без времени ("2026-11-18") в `dateTo` означает конец этих суток (UTC),
/// иначе фильтр «по 18 ноября» отрезал бы весь день. Полный ISO-момент
/// используется как есть.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function dateToUpperBound(value: string): Date {
  if (DATE_ONLY.test(value)) {
    return new Date(`${value}T23:59:59.999Z`);
  }
  return new Date(value);
}

export interface DateRange {
  gte?: Date;
  lte?: Date;
}

/// Возвращает фильтр `createdAt` либо undefined, если границы не заданы.
export function parseDateRange(
  dateFrom?: string,
  dateTo?: string,
): DateRange | undefined {
  if (!dateFrom && !dateTo) {
    return undefined;
  }
  return {
    ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
    ...(dateTo ? { lte: dateToUpperBound(dateTo) } : {}),
  };
}

/// true, если нижняя граница позже верхней (диапазон некорректен).
export function isDateRangeInverted(
  dateFrom?: string,
  dateTo?: string,
): boolean {
  if (!dateFrom || !dateTo) {
    return false;
  }
  return new Date(dateFrom) > dateToUpperBound(dateTo);
}
