import { formatDiscriminator, publicTag } from './public-tag';

describe('публичный discriminator (ADR-0099)', () => {
  it('всегда четыре цифры 0000–9999', () => {
    expect(formatDiscriminator(0)).toBe('0000');
    expect(formatDiscriminator(2)).toBe('0002');
    expect(formatDiscriminator(42)).toBe('0042');
    expect(formatDiscriminator(9999)).toBe('9999');
  });

  it('тег — ник и discriminator', () => {
    expect(publicTag('younaxo_', 2)).toBe('younaxo_#0002');
    expect(publicTag('Steve', 4821)).toBe('Steve#4821');
  });
});
