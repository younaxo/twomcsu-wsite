import {
  CommandTemplateError,
  validateRenderedCommand,
} from './command-template';

describe('validateRenderedCommand (0.13, белый список)', () => {
  it.each([
    'lp user Steve parent addtemp vip 30d',
    'luckperms user Steve parent set vip',
    'give Steve diamond 3',
    'crate give Steve key 1',
    'cratekey give Steve a 1',
    'eco give Steve 100',
  ])('пропускает %s', (c) => {
    expect(validateRenderedCommand(c)).toBe(c);
  });

  it.each([
    ['op Steve'],
    ['stop'],
    ['ban Steve'],
    ['/give Steve stone'],
    ['give Steve stone\nstop'],
    ['give Steve {username}'],
    ['give Steve stone; stop'],
    [' give Steve stone'],
    [''],
  ])('отклоняет %j', (c) => {
    expect(() => validateRenderedCommand(c)).toThrow(CommandTemplateError);
  });

  it('расширение корней применяется только если передано явно', () => {
    expect(() => validateRenderedCommand('tell Steve hi')).toThrow();
    expect(validateRenderedCommand('tell Steve hi', ['tell'])).toBe(
      'tell Steve hi',
    );
  });

  it('не строка отклоняется', () => {
    expect(() => validateRenderedCommand(5)).toThrow(CommandTemplateError);
  });
});
