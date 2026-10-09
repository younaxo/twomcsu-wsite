import { maskNickname } from './privacy.util';

describe('maskNickname (зеркало @twomc/shared)', () => {
  it.each([
    ['younaxo_', 'yo***o_'],
    ['Lavender42', 'La***42'],
    ['abcd', 'a***'],
    ['', '***'],
    [null, '***'],
    [undefined, '***'],
  ])('%p → %p', (input, expected) => {
    expect(maskNickname(input)).toBe(expected);
  });
});
