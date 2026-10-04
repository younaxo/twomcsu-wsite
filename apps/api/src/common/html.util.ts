/// Минимальный безопасный рендер пользовательского текста в HTML: экранирует
/// спецсимволы и переносит строки через <br>. Полноценный Markdown +
/// sanitize-html allowlist (как в 29-SECURITY.md старого проекта) — отдельная
/// кросс-доменная задача (используется chat/news/reports), пока не нужна:
/// этого достаточно, чтобы contentHtml не мог содержать выполняемый HTML/JS.
export function escapeToHtml(raw: string): string {
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return escaped.replace(/\r\n|\r|\n/g, '<br>');
}

const MENTION_PATTERN = /@([a-zA-Z0-9_]{3,16})/g;

/// Извлекает упомянутые username (@username) из текста — для заполнения
/// поля mentions (уведомления о упоминании — PHASE 12).
export function extractMentions(raw: string): string[] {
  const matches = raw.matchAll(MENTION_PATTERN);
  return Array.from(new Set(Array.from(matches, (m) => m[1])));
}
