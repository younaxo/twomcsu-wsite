/// Форматы кодов привязки Minecraft (A12) — те же правила, что на сервере
/// (`apps/api/src/modules/minecraft-link/code-format.ts`). Коды генерирует
/// только сервер; здесь — разбор ввода и отображение.
///
/// `X` — латинская буква A–Z, `0` — цифра 0–9, `-` — разделитель.
export const LINK_CODE_PATTERN = 'XXX-000-X0X0-0X0';
export const CHALLENGE_PATTERN = 'X0XX0';
/// Значимых символов в коде привязки (без дефисов).
export const LINK_CODE_SIGNIFICANT = LINK_CODE_PATTERN.replace(/-/g, '').length;
/// Длина отображаемой строки кода привязки (с дефисами).
export const LINK_CODE_DISPLAY_LENGTH = LINK_CODE_PATTERN.length;

export function slotAccepts(slot: string, char: string): boolean {
  return slot === 'X' ? /^[A-Z]$/.test(char) : slot === '0' ? /^[0-9]$/.test(char) : false;
}

/// Ввод/вставка → код по шаблону: верхний регистр, символы не своего типа
/// отбрасываются, дефисы расставляются сами. `ABC123A1B23C4` →
/// `ABC-123-A1B2-3C4`.
export function formatByPattern(raw: string, pattern: string): string {
  const slots = pattern.replace(/-/g, '');
  const chars = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let significant = '';
  for (const char of chars) {
    const slot = slots[significant.length];
    if (!slot) break;
    if (slotAccepts(slot, char)) significant += char;
  }
  let out = '';
  let index = 0;
  for (const slot of pattern) {
    if (index >= significant.length) break;
    if (slot === '-') {
      out += '-';
      continue;
    }
    out += significant[index];
    index += 1;
  }
  return out;
}

export function significantLength(value: string): number {
  return value.replace(/-/g, '').length;
}

export function isCompleteCode(value: string, pattern: string): boolean {
  return formatByPattern(value, pattern) === value && value.length === pattern.length;
}
