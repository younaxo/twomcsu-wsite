import { corsOrigin, parseOrigins } from './cors';

describe('CORS allowlist (ADR-0104)', () => {
  it('явный список, нормализация до origin, без дублей', () => {
    expect(
      parseOrigins(
        'https://twomc.su, https://twomc.su/, https://admin.twomc.su',
        true,
      ),
    ).toEqual(['https://twomc.su', 'https://admin.twomc.su']);
    expect(parseOrigins('http://localhost:3000', false)).toEqual([
      'http://localhost:3000',
    ]);
  });

  it('«*», шаблоны, не-http и пустой список — ошибка конфигурации', () => {
    expect(() => parseOrigins('*', true)).toThrow(/запрещены/);
    expect(() => parseOrigins('https://*.twomc.su', true)).toThrow(/запрещены/);
    expect(() => parseOrigins('javascript:alert(1)', false)).toThrow();
    expect(() => parseOrigins('', false)).toThrow(/пуст/);
    expect(() => parseOrigins('not a url', false)).toThrow(/некорректный/);
  });

  it('в production — только https (кроме localhost)', () => {
    expect(() => parseOrigins('http://twomc.su', true)).toThrow(/https/);
    expect(parseOrigins('http://localhost:3000', true)).toEqual([
      'http://localhost:3000',
    ]);
  });

  it('проверка origin — точное совпадение', () => {
    const check = corsOrigin(['https://twomc.su']);
    const result = (origin: string | undefined) =>
      new Promise<boolean | undefined>((resolve) =>
        check(origin, (_e, allow) => resolve(allow)),
      );
    return Promise.all([
      expect(result('https://twomc.su')).resolves.toBe(true),
      expect(result('https://evil.com')).resolves.toBe(false),
      expect(result('https://twomc.su.evil.com')).resolves.toBe(false),
      expect(result('http://twomc.su')).resolves.toBe(false),
      expect(result('null')).resolves.toBe(false),
      // Без Origin — не CORS-запрос (тот же сайт, сервер-сервер).
      expect(result(undefined)).resolves.toBe(true),
    ]);
  });
});
