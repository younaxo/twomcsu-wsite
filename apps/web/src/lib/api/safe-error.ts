import { ApiError, NetworkError } from './errors';

/// Понятный текст ошибки для игрока без сырых сообщений API: по статусу, а не по
/// `messages[0]` (там могут быть внутренние формулировки и тексты валидации).
/// Известные коды разбирают вызывающие модули; здесь — общий запасной путь.
export function safeErrorMessage(error: unknown, fallback = 'Не удалось выполнить действие.') {
  if (error instanceof NetworkError) return 'Нет соединения с сервером. Проверьте интернет.';
  if (!(error instanceof ApiError)) return fallback;
  if (error.status >= 500) return 'Сервер временно недоступен. Попробуйте позже.';
  switch (error.status) {
    case 400:
    case 422:
      return 'Проверьте введённые данные и повторите.';
    case 401:
      return 'Войдите в аккаунт, чтобы продолжить.';
    case 403:
      return 'Это действие вам недоступно.';
    case 404:
      return 'Не найдено: возможно, это уже удалено.';
    case 409:
      return 'Данные изменились. Обновите страницу и повторите.';
    case 429:
      return 'Слишком много запросов. Попробуйте чуть позже.';
    default:
      return fallback;
  }
}

const CYRILLIC = /[А-Яа-яЁё]/;

/// Текст для публичных страниц контента: понятное русское сообщение домена
/// (4xx: «Форма закрыта», «Приглашение истекло») показывается как есть, всё
/// остальное — английские тексты валидации, имена полей, 5xx — заменяется
/// безопасной формулировкой по статусу.
export function publicErrorMessage(error: unknown, fallback?: string): string {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    const first = error.messages[0]?.trim();
    if (first && first.length <= 200 && CYRILLIC.test(first) && !/[\n\r]/.test(first)) {
      return first;
    }
  }
  return safeErrorMessage(error, fallback);
}
