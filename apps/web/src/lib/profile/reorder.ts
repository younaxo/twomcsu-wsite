export type MoveDirection = 'up' | 'down';

/// Перестановка элемента на одну позицию. Чистая функция: исходный список не
/// меняется; на границах и при неверном индексе возвращается копия без правок.
export function moveItem<T>(list: readonly T[], index: number, dir: MoveDirection): T[] {
  const next = [...list];
  const target = dir === 'up' ? index - 1 : index + 1;
  if (!Number.isInteger(index) || index < 0 || index >= next.length) return next;
  if (target < 0 || target >= next.length) return next;
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item as T);
  return next;
}

/// Можно ли сдвинуть элемент в сторону (для disabled у кнопок).
export function canMove(length: number, index: number, dir: MoveDirection): boolean {
  return dir === 'up' ? index > 0 : index < length - 1;
}
