import { maskIp, maskNickname } from './privacy.util';

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

describe('maskIp', () => {
  it.each([
    ['203.0.113.77', '203.0.*.*'],
    ['::ffff:203.0.113.77', '203.0.*.*'],
    ['2001:0db8:85a3::8a2e:370:7334', '2001:0db8:*'],
    ['2001:DB8::1', '2001:db8:*'],
    ['garbage', '***'],
    ['::1', '***'],
    ['', null],
    [null, null],
    [undefined, null],
  ])('%p → %p', (input, expected) => {
    expect(maskIp(input)).toBe(expected);
  });
});
