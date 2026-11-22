const UNSAFE_CHARS = /[\p{C}‪-‮⁦-⁩]/gu;

/// Ник из адреса для заголовка вкладки: декодирует %-escape, удаляет
/// управляющие символы и bidi-метки ДО обрезки до 32 символов (спуфинг title).
export function safeHandle(raw: string): string {
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    // Битый %-escape — показываем как есть.
  }
  return value.replace(UNSAFE_CHARS, '').slice(0, 32);
}
