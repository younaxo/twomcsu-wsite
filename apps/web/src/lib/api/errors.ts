import type { ApiErrorBody } from '@twomc/shared';

/// Ошибка HTTP-уровня: backend ответил статусом ≥ 400. Разбирает стандартный
/// формат NestJS (`message` — строка или массив строк валидации) и поля
/// будущего единого формата (`code`/`details`/`requestId`, ADR-0007).
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly details: unknown;
  readonly requestId: string | undefined;
  readonly messages: string[];
  readonly body: unknown;

  constructor(
    status: number,
    messages: string[],
    extra: Partial<ApiErrorBody> & { body?: unknown } = {},
  ) {
    super(messages[0] ?? `Ошибка запроса (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.messages = messages;
    this.code = extra.code;
    this.details = extra.details;
    this.requestId = extra.requestId;
    this.body = extra.body;
  }

  static fromResponse(status: number, body: unknown): ApiError {
    if (body && typeof body === 'object') {
      const parsed = body as Partial<ApiErrorBody>;
      const raw = parsed.message;
      const messages = Array.isArray(raw)
        ? raw.map(String)
        : typeof raw === 'string' && raw.length > 0
          ? [raw]
          : [defaultMessage(status)];
      return new ApiError(status, messages, { ...parsed, body });
    }
    return new ApiError(status, [defaultMessage(status)], { body });
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isValidation(): boolean {
    return this.status === 400 || this.status === 422;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

/// Сеть недоступна / CORS / таймаут — ответа от backend не было вовсе.
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('Сервер недоступен. Проверьте соединение и повторите попытку.');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

function defaultMessage(status: number): string {
  switch (status) {
    case 400:
      return 'Некорректный запрос';
    case 401:
      return 'Требуется вход в систему';
    case 403:
      return 'Недостаточно прав';
    case 404:
      return 'Не найдено';
    case 409:
      return 'Конфликт данных';
    case 429:
      return 'Слишком много запросов, попробуйте позже';
    default:
      return status >= 500 ? 'Внутренняя ошибка сервера' : `Ошибка запроса (${status})`;
  }
}

/// Человекочитаемое сообщение для любого исключения (ApiError, NetworkError,
/// Error, строка) — для toast/ErrorState.
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.messages.join('. ');
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Неизвестная ошибка';
}
