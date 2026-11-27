import { describe, expect, it } from 'vitest';
import { ApiError, getSafeErrorMessage, NetworkError } from './errors';
import { publicErrorMessage, safeErrorMessage } from './safe-error';

describe('publicErrorMessage', () => {
  it('показывает русское сообщение домена для 4xx', () => {
    expect(publicErrorMessage(new ApiError(403, ['Приём ответов на форму закрыт']))).toBe(
      'Приём ответов на форму закрыт',
    );
  });
  it('скрывает английские тексты валидации', () => {
    expect(publicErrorMessage(new ApiError(400, ['content must be longer than 1']))).toBe(
      'Проверьте введённые данные и повторите.',
    );
  });
  it('не раскрывает сообщения 5xx, даже русские', () => {
    expect(publicErrorMessage(new ApiError(500, ['Ошибка БД: таблица news']))).toBe(
      'Сервер временно недоступен. Попробуйте позже.',
    );
  });
  it('скрывает слишком длинные тексты и сетевые ошибки обрабатывает отдельно', () => {
    expect(publicErrorMessage(new ApiError(400, ['я'.repeat(300)]))).toBe(
      'Проверьте введённые данные и повторите.',
    );
    expect(publicErrorMessage(new NetworkError())).toContain('соединения');
  });
  const generic = 'Проверьте введённые данные и повторите.';
  it.each([
    ['email', 'Почта user@example.com уже занята'],
    ['IPv4', 'Доступ с адреса 192.168.0.12 запрещён'],
    ['IPv6', 'Доступ с адреса 2001:db8::1 запрещён'],
    ['URL', 'Перейдите на https://evil.example/pay'],
    ['путь', 'Файл не найден: /srv/api/uploads/a.png'],
    ['путь Windows', 'Файл не найден: C:\\app\\x'],
    ['SQL', 'Ошибка запроса: SELECT из таблицы'],
    ['стек', 'Сбой at handler (file.js:10)'],
    ['латинский идентификатор', 'Поле displayName указано неверно'],
    ['snake_case', 'Ошибка в поле user_id'],
  ])('скрывает текст с признаком: %s', (_name, text) => {
    expect(publicErrorMessage(new ApiError(400, [text]))).toBe(generic);
  });
  it('время вида 10:30:00 не считается IPv6', () => {
    expect(publicErrorMessage(new ApiError(403, ['Запись открывается в 10:30:00']))).toBe(
      'Запись открывается в 10:30:00',
    );
  });
  it('граница 200 символов: 200 показывается, 201 скрывается', () => {
    expect(publicErrorMessage(new ApiError(400, ['я'.repeat(200)]))).toBe('я'.repeat(200));
    expect(publicErrorMessage(new ApiError(400, ['я'.repeat(201)]))).toBe(generic);
  });
  it('статусы 401/403/404/409/429/503 берутся из общей таблицы', () => {
    for (const status of [401, 403, 404, 409, 429, 503]) {
      const error = new ApiError(status, ['x']);
      expect(publicErrorMessage(error)).toBe(safeErrorMessage(error));
      expect(getSafeErrorMessage(error)).toBe(safeErrorMessage(error));
    }
  });
});
