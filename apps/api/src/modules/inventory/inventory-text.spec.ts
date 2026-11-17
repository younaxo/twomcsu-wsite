import { sanitizeColor, sanitizeItemText, sanitizeRun } from './inventory-text';

const SECTION = String.fromCharCode(0xa7);
const RLO = String.fromCharCode(0x202e);
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);
const ZWSP = String.fromCharCode(0x200b);
const SHY = String.fromCharCode(0xad);
const BOM = String.fromCharCode(0xfeff);

describe('inventory text', () => {
  it('вырезает классические коды § и одиночный §', () => {
    expect(sanitizeItemText(`${SECTION}6${SECTION}lМеч${SECTION}r!`)).toBe(
      'Меч!',
    );
    expect(sanitizeItemText(`a${SECTION}`)).toBe('a');
    expect(
      sanitizeItemText(
        `${SECTION}x${SECTION}f${SECTION}f${SECTION}0${SECTION}0${SECTION}0${SECTION}0A`,
      ),
    ).toBe('A');
  });

  it('вырезает управляющие, bidi, невидимые и теги', () => {
    expect(sanitizeItemText(`a\nb\tc\u0000d`)).toBe('abcd');
    expect(sanitizeItemText(`a${RLO}b${LRI}c${PDI}`)).toBe('abc');
    expect(sanitizeItemText(`a${ZWSP}b${SHY}c${BOM}`)).toBe('abc');
    expect(sanitizeItemText(`a${String.fromCodePoint(0xe0041)}b`)).toBe('ab');
  });

  it('нормализует в NFC и режет до 256 символов', () => {
    expect(sanitizeItemText('é')).toBe('é');
    expect(Array.from(sanitizeItemText('я'.repeat(500)))).toHaveLength(256);
  });

  it('не экранирует и не меняет HTML-подобный текст (вывод только как текст)', () => {
    expect(sanitizeItemText('<script>alert(1)</script>')).toBe(
      '<script>alert(1)</script>',
    );
  });

  it('цвет: только #RRGGBB или 16 имён', () => {
    expect(sanitizeColor('#f26a1b')).toBe('#F26A1B');
    expect(sanitizeColor('GOLD')).toBe('gold');
    expect(sanitizeColor('red; background:url(x)')).toBeUndefined();
    expect(sanitizeColor('#12345')).toBeUndefined();
    expect(sanitizeColor('#12345G')).toBeUndefined();
    expect(sanitizeColor('rgb(0,0,0)')).toBeUndefined();
    expect(sanitizeColor(123)).toBeUndefined();
  });

  it('прогон: отбрасывает clickEvent, hoverEvent, selector и прочее', () => {
    const run = sanitizeRun({
      text: 'x',
      color: 'red',
      bold: true,
      italic: 'yes',
      clickEvent: { action: 'open_url', value: 'http://evil.example' },
      hoverEvent: {},
      selector: '@a',
      nbt: 'x',
      translate: 'chat.type',
      insertion: 'y',
    });
    expect(run).toEqual({ text: 'x', color: 'red', bold: true });
  });

  it('прогон: пустой после очистки — null; не строка — null', () => {
    expect(sanitizeRun({ text: `${SECTION}c${ZWSP}` })).toBeNull();
    expect(sanitizeRun({ text: 5 })).toBeNull();
  });
});
