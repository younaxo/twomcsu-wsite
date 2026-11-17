import { MAX_RUN_TEXT } from './inventory-limits';
import type { NormalizedTextRun } from './inventory.types';

/// Очистка текста предметов (ADR-0168, раздел 3.3 и 7.1; Q38 (а): названия
/// принимаются как есть, но только как plain text). Результат выводить
/// React-текстом, никогда как HTML и без автоссылок.

/// Классические коды форматирования: «§» + символ кода, а также
/// `§x§r§r§g§g§b§b` (разбираются попарно этим же шаблоном).
const SECTION_CODE = /§[0-9a-fk-orxA-FK-OR]/g;
const SECTION_SIGN = /§/g;

/// Управляющие символы (в том числе перевод строки и табуляция), C1, мягкий
/// перенос, нулевая ширина и LRM/RLM (U+200B-200F), bidi-встраивания
/// U+202A-202E и изоляты U+2066-2069, разделители строк, word joiner и
/// «невидимые операторы» (U+2060-206F), BOM, interlinear annotation,
/// символы-теги Unicode.
const UNSAFE =
  /[\u{0}-\u{1F}\u{7F}-\u{9F}\u{AD}\u{61C}\u{180E}\u{200B}-\u{200F}\u{2028}-\u{2029}\u{202A}-\u{202E}\u{2060}-\u{206F}\u{FEFF}\u{FFF9}-\u{FFFB}\u{E0000}-\u{E007F}]/gu;

const COLOR_HEX = /^#[0-9a-fA-F]{6}$/;

export const NAMED_COLORS: ReadonlySet<string> = new Set([
  'black',
  'dark_blue',
  'dark_green',
  'dark_aqua',
  'dark_red',
  'dark_purple',
  'gold',
  'gray',
  'dark_gray',
  'blue',
  'green',
  'aqua',
  'red',
  'light_purple',
  'yellow',
  'white',
]);

/// NFC, вырезание «§»-кодов, управляющих и bidi-символов, лимит длины.
export function sanitizeItemText(raw: string): string {
  const clean = raw
    .normalize('NFC')
    .replace(SECTION_CODE, '')
    .replace(SECTION_SIGN, '')
    .replace(UNSAFE, '');
  const chars = Array.from(clean);
  return chars.length > MAX_RUN_TEXT
    ? chars.slice(0, MAX_RUN_TEXT).join('')
    : clean;
}

/// `#RRGGBB` (верхний регистр) либо имя из 16 цветов; иначе `undefined`.
export function sanitizeColor(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  if (COLOR_HEX.test(raw)) return raw.toUpperCase();
  const lower = raw.toLowerCase();
  return NAMED_COLORS.has(lower) ? lower : undefined;
}

const STYLE_KEYS = [
  'bold',
  'italic',
  'underlined',
  'strikethrough',
  'obfuscated',
] as const;

/// Один прогон: неизвестные поля (`clickEvent`, `hoverEvent`, `selector`,
/// `nbt`, `translate`, `insertion` и т.д.) отбрасываются, цвет проверяется по
/// шаблону, стили принимаются только булевы. Прогон без текста после очистки
/// возвращает `null`.
export function sanitizeRun(
  raw: Record<string, unknown>,
): NormalizedTextRun | null {
  if (typeof raw.text !== 'string') return null;
  const text = sanitizeItemText(raw.text);
  if (text.length === 0) return null;
  const run: NormalizedTextRun = { text };
  const color = sanitizeColor(raw.color);
  if (color !== undefined) run.color = color;
  for (const key of STYLE_KEYS) {
    const value = raw[key];
    if (typeof value === 'boolean') run[key] = value;
  }
  return run;
}
