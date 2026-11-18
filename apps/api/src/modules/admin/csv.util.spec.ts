import { Prisma } from '@prisma/client';
import { toCsv } from './csv.util';

/// L1 (ревью 0.4): экранирование формул и CSV-инъекций в toCsv.
describe('toCsv', () => {
  const one = (value: unknown) => toCsv([{ v: value }], ['v']).split('\r\n')[1];

  it('заголовок и строки через CRLF', () => {
    expect(toCsv([{ a: 'x', b: 'y' }], ['a', 'b'])).toBe('a,b\r\nx,y');
  });

  it.each(['=1+1', '+1', '-1', '@SUM(A1)'])(
    'строка с триггером формулы %s получает префикс-апостроф',
    (v) => {
      expect(one(v)).toBe(`'${v}`);
    },
  );

  it('ведущий TAB: префикс-апостроф', () => {
    expect(one('\t=1+1')).toBe("'\t=1+1");
  });

  it('ведущий CR: префикс-апостроф и кавычки (CR — разделитель строки)', () => {
    expect(one('\r=1+1')).toBe(`"'\r=1+1"`);
  });

  it('триггер не в начале строки не трогаем', () => {
    expect(one('a=1')).toBe('a=1');
    expect(one('a\t=1')).toBe('a\t=1');
  });

  it('ведущий пробел: значение не меняется (тривиальный текст), формула в нём не исполняется', () => {
    expect(one(' text')).toBe(' text');
    expect(one(' =1+1')).toBe(' =1+1');
  });

  it('числа и Decimal не экранируются: отрицательные суммы остаются числами', () => {
    expect(one(-5)).toBe('-5');
    expect(one(0)).toBe('0');
    expect(one(12.5)).toBe('12.5');
    expect(one(new Prisma.Decimal('-10.50'))).toBe('-10.5');
  });

  it('null/undefined — пустая ячейка; Date — ISO', () => {
    expect(toCsv([{ a: null }], ['a'])).toBe('a\r\n');
    expect(toCsv([{}], ['a'])).toBe('a\r\n');
    expect(one(new Date('2026-01-02T03:04:05.000Z'))).toBe(
      '2026-01-02T03:04:05.000Z',
    );
  });

  it('запятая, кавычки, переводы строк — RFC4180; инъекция плюс кавычки', () => {
    expect(one('a,b')).toBe('"a,b"');
    expect(one('say "hi"')).toBe('"say ""hi"""');
    expect(one('l1\nl2')).toBe('"l1\nl2"');
    expect(one('=HYPERLINK("x","y")')).toBe(`"'=HYPERLINK(""x"",""y"")"`);
  });

  it('заголовки тоже экранируются', () => {
    expect(toCsv([], ['=evil'])).toBe("'=evil");
  });
});
