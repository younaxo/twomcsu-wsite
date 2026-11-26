import { ApiError, getErrorMessage } from '@/lib/api/errors';

/// Понятные тексты для ошибок обращений (400/403/404/409). Если backend
/// прислал собственное сообщение (например, «Укажите ник нарушителя»), оно
/// приоритетнее общего: по нему пользователь понимает, что исправить.
const FALLBACK: Record<number, string> = {
  400: 'Проверьте заполнение формы.',
  403: 'Действие недоступно: обращение закрыто, заблокировано или принадлежит другому пользователю.',
  404: 'Не найдено: обращение, наказание или пользователь не существуют.',
  409: 'Конфликт: по этому наказанию уже есть открытое обращение или данные изменились.',
};

/// Коды обжалования наказания сервера (ADR-0196): понятнее общего текста статуса.
const BY_CODE: Record<string, string> = {
  appeal_cooldown:
    'Это наказание уже обжаловали менее суток назад. Повторно подать обращение можно через 24 часа после предыдущего.',
  appeal_already_open:
    'По этому наказанию уже есть открытое обращение. Дождитесь решения или ответьте в нём.',
};

export function describeSupportError(error: unknown): string {
  if (error instanceof ApiError) {
    const byCode = error.code ? BY_CODE[error.code] : undefined;
    if (byCode) return byCode;
    const generic = FALLBACK[error.status];
    const own = getErrorMessage(error);
    const isDefault = ['Некорректный запрос', 'Недостаточно прав', 'Не найдено', 'Конфликт данных'];
    if (generic && (!own || isDefault.includes(own))) return generic;
    return own;
  }
  return getErrorMessage(error);
}
