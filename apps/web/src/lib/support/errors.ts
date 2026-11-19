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

export function describeSupportError(error: unknown): string {
  if (error instanceof ApiError) {
    const generic = FALLBACK[error.status];
    const own = getErrorMessage(error);
    const isDefault = ['Некорректный запрос', 'Недостаточно прав', 'Не найдено', 'Конфликт данных'];
    if (generic && (!own || isDefault.includes(own))) return generic;
    return own;
  }
  return getErrorMessage(error);
}
