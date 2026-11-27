import { ApiError, NETWORK_ERROR_MESSAGE, NetworkError, statusMessage } from './errors';

/// Понятный текст ошибки для игрока без сырых сообщений API: по статусу, а не по
/// `messages[0]` (там могут быть внутренние формулировки и тексты валидации).
/// Известные коды разбирают вызывающие модули; здесь — общий запасной путь.
/// Таблица статусов общая с `getSafeErrorMessage` (errors.ts).
export function safeErrorMessage(error: unknown, fallback = 'Не удалось выполнить действие.') {
  if (error instanceof NetworkError) return NETWORK_ERROR_MESSAGE;
  if (!(error instanceof ApiError)) return fallback;
  return statusMessage(error.status) ?? fallback;
}

const CYRILLIC = /[А-Яа-яЁё]/;
const MAX_PUBLIC_LENGTH = 200;

/// Признаки технического или персонального текста, который нельзя показывать игроку.
const UNSAFE_PATTERNS: readonly RegExp[] = [
  /[\n\r\t]/,
  /[^\s@]+@[^\s@]+/, // email
  /\b\d{1,3}(?:\.\d{1,3}){3}\b/, // IPv4
  /::/, // IPv6 в сжатой записи
  /(?<![\w:])(?=[0-9a-f:]*[a-f])(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}(?![\w:])/i, // IPv6 (время 10:30:00 не задевает)
  /(?<![\w:])(?:[0-9]{1,4}:){7}[0-9]{1,4}(?![\w:])/, // IPv6 в полной записи без букв a–f (2001:0:0:0:0:0:0:1)
  /:\/\/|\bwww\./i, // URL
  /[/\\]/, // пути
  /\b(?:select|insert|update|delete|drop|from|where|join|prisma|sql|stack|exception|error|undefined|null|nan)\b/i,
  /\bat\s+\S+\s*\(/i, // строка стека «at fn (file)»
  /[A-Za-z]{3,}/, // латинские идентификаторы и имена полей
  /\w*_\w*/, // snake_case
  /[{}[\]<>`$]/,
];

function isPublicDomainText(text: string): boolean {
  return (
    text.length > 0 &&
    text.length <= MAX_PUBLIC_LENGTH &&
    CYRILLIC.test(text) &&
    !UNSAFE_PATTERNS.some((pattern) => pattern.test(text))
  );
}

/// Текст для публичных страниц контента: короткое русское сообщение домена
/// (4xx: «Форма закрыта», «Приглашение истекло») показывается только если в нём
/// нет email, IP, URL, путей, SQL/стека и латинских идентификаторов; всё остальное
/// (английские тексты валидации, имена полей, 5xx) заменяется формулировкой по статусу.
export function publicErrorMessage(error: unknown, fallback?: string): string {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    const first = error.messages[0]?.trim();
    if (first && isPublicDomainText(first)) return first;
  }
  return safeErrorMessage(error, fallback);
}
