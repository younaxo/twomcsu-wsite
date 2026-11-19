import { DeliveryTaskStatus } from '@prisma/client';
import { DONE_STATUSES } from './delivery.constants';

/// Статус выдачи для покупателя: без внутренних деталей (ADR-0184 п. 10).
export type BuyerDeliveryStatus = 'pending' | 'delivered' | 'failed';

/// Агрегат по статусам заданий одной позиции или всего заказа. Отменённые
/// задания (возврат) не учитываются. Нет заданий — «ожидает».
export function buyerDeliveryStatus(
  statuses: readonly DeliveryTaskStatus[],
): BuyerDeliveryStatus {
  const active = statuses.filter((s) => s !== DeliveryTaskStatus.CANCELLED);
  if (active.length === 0) return 'pending';
  if (
    active.some(
      (s) =>
        s === DeliveryTaskStatus.FAILED ||
        s === DeliveryTaskStatus.NEEDS_ATTENTION,
    )
  ) {
    return 'failed';
  }
  if (active.every((s) => DONE_STATUSES.includes(s))) return 'delivered';
  return 'pending';
}

/// Сколько символов исходной ошибки вообще разбирается регулярками: защита
/// от квадратичного разбора на огромных сообщениях. Итог всё равно до 300.
const SANITIZE_INPUT_LIMIT = 4000;

/// Заголовок `Authorization: [схема] значение`: скрывается целиком.
const AUTHORIZATION_HEADER =
  /\bauthorization["']?\s*[=:]\s*["']?(?:(?:basic|bearer|digest|token|negotiate|ntlm|apikey|api-key)(?:\s+|\s*[=:]\s*))?[^\s"']+["']?/gi;
/// `Bearer <токен>` и `Bearer:<токен>` в любом месте текста, токен любой длины.
const BEARER_TOKEN = /\bbearer(?:\s+|\s*[=:]\s*)[^\s"']+/gi;
/// Экранирование и URL-кодирование, за которыми прячутся разделители:
/// `\"` (JSON внутри строки), `%3D` (=), `%3A` (:), `%22` ("). Приводятся к
/// обычному виду до поиска секретов; замены линейные, без backtracking.
const ESCAPED_QUOTE = /\\+"/g;
const PERCENT_DELIMITERS = /%(3[dDaA]|22|20)/g;
/// `схема://user:pass@host`: userinfo (логин и пароль) скрывается целиком.
const URL_USERINFO = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/]*@/gi;
/// Секретные ключи в формах `key=value`, `key: value`, `"key":"value"`
/// (в т.ч. с префиксом: `db_password`, `access_token`) и значением в кавычках.
const SECRET_KEY_VALUE =
  /(["']?)([\w.-]*(?:pass(?:word|wd)?|pwd|rcon|api[_-]?key|token|secret|key))\1\s*[=:]\s*(?:"(?:[^"\\]|\\.)*"|'[^']*'|\S+)/gi;

/// Очищенный текст ошибки: без токенов, ключей, паролей, заголовков
/// авторизации, userinfo в URL и длинных непрозрачных строк.
export function sanitizeDeliveryError(raw: unknown): string {
  const text =
    raw instanceof Error
      ? `${raw.name}: ${raw.message}`
      : typeof raw === 'string'
        ? raw
        : 'unknown_error';
  return text
    .slice(0, SANITIZE_INPUT_LIMIT)
    .replace(ESCAPED_QUOTE, '"')
    .replace(PERCENT_DELIMITERS, (_m, code: string) =>
      code === '22'
        ? '"'
        : code === '20'
          ? ' '
          : code.toLowerCase() === '3d'
            ? '='
            : ':',
    )
    .replace(AUTHORIZATION_HEADER, 'authorization=[скрыто]')
    .replace(BEARER_TOKEN, 'Bearer [скрыто]')
    .replace(URL_USERINFO, '$1[скрыто]@')
    .replace(SECRET_KEY_VALUE, '$2=[скрыто]')
    .replace(/[A-Za-z0-9+/=_-]{24,}/g, '[скрыто]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 300);
}
