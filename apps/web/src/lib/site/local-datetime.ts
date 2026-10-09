/// Дата и время в часовом поясе администратора ↔ ISO (UTC) для хранения
/// (ADR-0079). Сервер хранит и сравнивает только UTC; в форме админ видит своё
/// локальное время и подпись пояса — без «тихих» сдвигов на 3 часа.

const pad = (value: number) => String(value).padStart(2, '0');

/// ISO → { date: 'YYYY-MM-DD', time: 'HH:MM' } в локальном поясе.
export function isoToLocalParts(iso: string | null | undefined): {
  date: string | null;
  time: string;
} {
  if (!iso) return { date: null, time: '' };
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return { date: null, time: '' };
  return {
    date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    time: `${pad(value.getHours())}:${pad(value.getMinutes())}`,
  };
}

/// Локальные дата и время → ISO (UTC). Пустое время — `fallbackTime`.
export function localPartsToIso(date: string, time: string, fallbackTime = '00:00'): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = (time || fallbackTime).split(':').map(Number);
  return new Date(year!, (month ?? 1) - 1, day ?? 1, hours ?? 0, minutes ?? 0).toISOString();
}

/// «Europe/Moscow (UTC+3)» — понятная подпись пояса администратора.
export function timezoneLabel(now = new Date()): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'локальное время';
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '−';
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  return `${zone} (UTC${sign}${hours}${minutes ? `:${pad(minutes)}` : ''})`;
}
