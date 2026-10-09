/// Маскирование ника для публичных лент (недавние покупки и т.п.).
/// Зеркало `maskNickname` из `@twomc/shared` (frontend): API не импортирует
/// runtime-значения из shared — пакет отдаёт TS-исходники, и tsc втянул бы их
/// в сборку Nest, сломав раскладку `dist/`. Алгоритм обязан совпадать —
/// это проверяет `privacy.util.spec.ts` на тех же примерах, что и web-тест.
///
/// Первые 2 и последние 2 символа, середина `***`: `younaxo_` → `yo***o_`;
/// короткие (≤ 4) → первый символ + `***`; пустое → `***`.
export function maskNickname(nickname: string | null | undefined): string {
  const value = (nickname ?? '').trim();
  if (value.length === 0) {
    return '***';
  }
  if (value.length <= 4) {
    return `${value[0]}***`;
  }
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}
