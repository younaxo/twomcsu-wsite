import {
  CHALLENGE_PATTERN,
  LINK_CODE_PATTERN,
  generateByPattern,
  matchesPattern,
  normalizeCode,
} from './code-format';

describe('форматы кодов Minecraft (A12)', () => {
  it('код привязки — XXX-000-X0X0-0X0 (16 символов), подтверждение — X0XX0', () => {
    for (let i = 0; i < 200; i += 1) {
      const link = generateByPattern(LINK_CODE_PATTERN);
      expect(link).toMatch(/^[A-Z]{3}-[0-9]{3}-[A-Z][0-9][A-Z][0-9]-[0-9][A-Z][0-9]$/);
      expect(link).toHaveLength(16);
      expect(matchesPattern(normalizeCode(link), LINK_CODE_PATTERN)).toBe(true);
      const challenge = generateByPattern(CHALLENGE_PATTERN);
      expect(challenge).toMatch(/^[A-Z][0-9][A-Z]{2}[0-9]$/);
    }
  });

  it('нормализация: регистр, дефисы, пробелы; неверный шаблон — отказ', () => {
    expect(normalizeCode(' abc-123-a1b2-3c4 ')).toBe('ABC123A1B23C4');
    expect(matchesPattern('ABC123A1B23C4', LINK_CODE_PATTERN)).toBe(true);
    expect(matchesPattern('ABC123A1B23CX', LINK_CODE_PATTERN)).toBe(false);
    expect(matchesPattern('ABC123A1B23C', LINK_CODE_PATTERN)).toBe(false);
    expect(matchesPattern('A1BC2', CHALLENGE_PATTERN)).toBe(true);
    expect(matchesPattern('K7Q2M', CHALLENGE_PATTERN)).toBe(false);
  });
});
