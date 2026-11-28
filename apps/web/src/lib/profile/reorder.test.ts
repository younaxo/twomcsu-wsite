import { describe, expect, it } from 'vitest';
import { canMove, moveItem } from './reorder';

describe('moveItem', () => {
  it('двигает вверх и вниз', () => {
    expect(moveItem(['a', 'b', 'c'], 1, 'up')).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 'down')).toEqual(['a', 'c', 'b']);
  });
  it('на границах ничего не меняет', () => {
    expect(moveItem(['a', 'b'], 0, 'up')).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 'down')).toEqual(['a', 'b']);
  });
  it('неверный индекс и пустой список безопасны', () => {
    expect(moveItem(['a'], 5, 'up')).toEqual(['a']);
    expect(moveItem(['a'], -1, 'down')).toEqual(['a']);
    expect(moveItem([], 0, 'down')).toEqual([]);
  });
  it('не мутирует исходный список', () => {
    const src = ['a', 'b', 'c'];
    const out = moveItem(src, 0, 'down');
    expect(src).toEqual(['a', 'b', 'c']);
    expect(out).not.toBe(src);
  });
});

describe('canMove', () => {
  it('границы', () => {
    expect(canMove(3, 0, 'up')).toBe(false);
    expect(canMove(3, 0, 'down')).toBe(true);
    expect(canMove(3, 2, 'down')).toBe(false);
    expect(canMove(3, 2, 'up')).toBe(true);
  });
});
