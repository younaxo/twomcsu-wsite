/// Единый privacy-алгоритм для публичных лент (недавние покупки, виджеты):
/// ник показывается частично — первые 2 и последние 2 символа, середина `***`.
/// `younaxo_` → `yo***o_`, короткие (≤ 4) → первый символ + `***`.
/// E-mail/логин/личные данные в публичные ответы не попадают вовсе.
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
