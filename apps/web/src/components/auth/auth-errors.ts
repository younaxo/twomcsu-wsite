import { ApiError, NetworkError } from '@/lib/api/errors';

/// Единое описание ошибок auth-форм: сеть, rate-limit, captcha, 401/403/409,
/// ошибки валидации backend (массив сообщений).
export function describeAuthError(
  error: unknown,
  fallback = 'Не удалось выполнить запрос.',
): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return 'Слишком много попыток. Подождите немного и попробуйте снова.';
    }
    if (isCaptchaRejected(error)) {
      return 'Проверка Cloudflare не пройдена. Подтвердите, что вы не робот, и повторите.';
    }
    if (error.status === 401) {
      return 'Неверный логин или пароль.';
    }
    if (error.status === 403) {
      return error.message || 'Действие запрещено.';
    }
    if (error.status === 409) {
      return error.message || 'Такой аккаунт уже существует.';
    }
    if (error.messages.length > 1) {
      return error.messages.join(' ');
    }
    return error.message || fallback;
  }
  if (error instanceof NetworkError) {
    return 'Сервер недоступен. Проверьте подключение и попробуйте ещё раз.';
  }
  return fallback;
}

/// Backend отверг Turnstile-токен (403 `{ requiresCaptcha: true }` или текст о captcha).
export function isCaptchaRejected(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 403) {
    return false;
  }
  const body = error.body as { requiresCaptcha?: boolean; message?: unknown } | null;
  if (body && typeof body === 'object' && body.requiresCaptcha === true) {
    return true;
  }
  return /captcha/i.test(error.message);
}
