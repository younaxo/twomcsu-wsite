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

/// Маскирование IP для самого пользователя (личный журнал сессий, 0.6):
/// полный адрес видит только персонал (Q21, ADR-0177).
/// IPv4 → `a.b.*.*`; IPv4-mapped IPv6 (`::ffff:a.b.c.d`) — как IPv4;
/// IPv6 → первые два хекстета и `:*` (`2001:db8:*`); нераспознанное → `***`;
/// пусто/null → null.
export function maskIp(ip: string | null | undefined): string | null {
  const value = (ip ?? '').trim();
  if (value.length === 0) {
    return null;
  }
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(value);
  const v4 = mapped ? mapped[1] : value;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(v4)) {
    const [a, b] = v4.split('.');
    return `${a}.${b}.*.*`;
  }
  if (/^[0-9a-f:]+$/i.test(value) && value.includes(':')) {
    const groups = value.split(':').filter((g) => g.length > 0);
    if (groups.length >= 2) {
      return `${groups[0].toLowerCase()}:${groups[1].toLowerCase()}:*`;
    }
  }
  return '***';
}
