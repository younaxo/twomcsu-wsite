import { describe, expect, it } from 'vitest';
import { applyMention, findMentionToken } from './mention-token';

describe('findMentionToken', () => {
  it('находит токен в начале и после пробела или перевода строки', () => {
    expect(findMentionToken('@ab', 3)).toEqual({ start: 0, end: 3, query: 'ab' });
    expect(findMentionToken('hi @bob_1', 9)?.query).toBe('bob_1');
    expect(findMentionToken('hi\n@bob', 7)?.start).toBe(3);
  });
  it('не срабатывает для email и без @', () => {
    expect(findMentionToken('a@bob', 5)).toBeNull();
    expect(findMentionToken('bob', 3)).toBeNull();
    expect(findMentionToken('@bob ', 5)).toBeNull();
  });
  it('учитывает позицию курсора', () => {
    expect(findMentionToken('@bob tail', 3)?.query).toBe('bo');
  });
});

describe('applyMention', () => {
  it('заменяет токен в позиции курсора и ставит курсор после пробела', () => {
    const token = findMentionToken('hi @bo there', 6);
    expect(token).not.toBeNull();
    expect(applyMention('hi @bo there', token!, 'Bob')).toEqual({
      value: 'hi @Bob there',
      caret: 8,
    });
  });
  it('добавляет пробел в конце текста', () => {
    const token = findMentionToken('@bo', 3);
    expect(applyMention('@bo', token!, 'Bob')).toEqual({ value: '@Bob ', caret: 5 });
  });
});

describe('findMentionToken: символы ника', () => {
  // Формат ника: [A-Za-z0-9_]{3,16} (register-form USERNAME_PATTERN, MINECRAFT_NAME в API).
  it('подчёркивание и цифры входят в токен', () => {
    expect(findMentionToken('@Steve_1', 8)?.query).toBe('Steve_1');
  });
  it('точка и дефис ник не продолжают', () => {
    expect(findMentionToken('@Steve.x', 8)).toBeNull();
    expect(findMentionToken('@Steve-x', 8)).toBeNull();
  });
});
