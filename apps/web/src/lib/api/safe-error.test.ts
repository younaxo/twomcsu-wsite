import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError } from './errors';
import { publicErrorMessage } from './safe-error';

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
});
