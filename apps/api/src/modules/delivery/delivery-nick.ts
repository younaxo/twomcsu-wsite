/// Повторная проверка ника на этапе delivery (ADR-0184 Р9): при создании
/// задания и при отправке, а не только при оформлении.
const NICK_RE = /^[A-Za-z0-9_]{3,16}$/;

/// Зарезервированные слова и селекторы; сравнение без учёта регистра. Селекторы
/// (`@a`, `@e`, ...) и `*` не проходят и по регулярке, список — вторая линия.
const RESERVED_NICKS = new Set(['all', '*', '@a', '@e', '@p', '@r', '@s']);

export function isDeliverableNick(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!NICK_RE.test(value)) return false;
  return !RESERVED_NICKS.has(value.toLowerCase());
}

/// Ник или null, если он не годится для выдачи.
export function deliverableNickOrNull(value: unknown): string | null {
  return isDeliverableNick(value) ? value : null;
}
