import { BadRequestException } from '@nestjs/common';
import {
  INVALID_CURSOR_CODE,
  decodeCursor,
  encodeCursor,
  filterHash,
} from './punishments-cursor';

/// Контракт 2.1 и тест-план п.11: курсор строго проверяется, привязан к
/// порядку и набору фильтров.
const HASH = filterHash('public', { kinds: ['BAN'] });

function raw(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function expectInvalid(fn: () => unknown): void {
  let thrown: unknown;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  expect(thrown).toBeInstanceOf(BadRequestException);
  expect((thrown as BadRequestException).getResponse()).toMatchObject({
    statusCode: 400,
    code: INVALID_CURSOR_CODE,
  });
}

describe('punishments-cursor', () => {
  it('кодирует и декодирует позицию без потерь', () => {
    const encoded = encodeCursor(
      { t: 1_700_000_000_000, i: 'abc_-9' },
      'desc',
      HASH,
    );
    expect(decodeCursor(encoded, 'desc', HASH)).toEqual({
      t: 1_700_000_000_000,
      i: 'abc_-9',
    });
  });

  it('курсор другого порядка или другого набора фильтров - 400', () => {
    const encoded = encodeCursor({ t: 1, i: 'a' }, 'desc', HASH);
    expectInvalid(() => decodeCursor(encoded, 'asc', HASH));
    expectInvalid(() =>
      decodeCursor(encoded, 'desc', filterHash('public', { kinds: ['MUTE'] })),
    );
  });

  it('курсор другого эндпоинта (scope) не подходит', () => {
    const staffHash = filterHash('staff', { kinds: ['BAN'] });
    expect(staffHash).not.toBe(HASH);
    const encoded = encodeCursor({ t: 1, i: 'a' }, 'desc', staffHash);
    expectInvalid(() => decodeCursor(encoded, 'desc', HASH));
  });

  it('хэш фильтров не зависит от порядка ключей', () => {
    expect(filterHash('x', { a: 1, b: 2 })).toBe(
      filterHash('x', { b: 2, a: 1 }),
    );
  });

  it.each([
    ['пустая строка', ''],
    ['недопустимый алфавит', 'abc$%'],
    ['слишком длинная', 'a'.repeat(201)],
    ['не JSON', Buffer.from('not json').toString('base64url')],
    ['массив', raw([1, 2])],
    ['null', raw(null)],
    ['лишний ключ', raw({ t: 1, i: 'a', o: 'desc', f: HASH, x: 1 })],
    ['нет ключа', raw({ t: 1, i: 'a', o: 'desc' })],
    ['t не число', raw({ t: '1', i: 'a', o: 'desc', f: HASH })],
    ['t отрицательный', raw({ t: -1, i: 'a', o: 'desc', f: HASH })],
    ['t дробный', raw({ t: 1.5, i: 'a', o: 'desc', f: HASH })],
    ['t больше предела даты', raw({ t: 9e15, i: 'a', o: 'desc', f: HASH })],
    ['i с недопустимым символом', raw({ t: 1, i: "a'b", o: 'desc', f: HASH })],
    ['i длиннее 40', raw({ t: 1, i: 'a'.repeat(41), o: 'desc', f: HASH })],
    ['o вне набора', raw({ t: 1, i: 'a', o: 'up', f: HASH })],
    ['f не hex16', raw({ t: 1, i: 'a', o: 'desc', f: 'ZZ' })],
  ])('неверный курсор (%s) - 400 punishments_invalid_cursor', (_n, value) => {
    expectInvalid(() => decodeCursor(value, 'desc', HASH));
  });

  it('позиция определяется парой (t, id), а не смещением', () => {
    const a = encodeCursor({ t: 5, i: 'a' }, 'asc', HASH);
    const b = encodeCursor({ t: 5, i: 'b' }, 'asc', HASH);
    expect(a).not.toBe(b);
    expect(decodeCursor(b, 'asc', HASH)).toEqual({ t: 5, i: 'b' });
  });
});
