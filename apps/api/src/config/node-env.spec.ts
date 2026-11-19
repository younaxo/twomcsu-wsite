import { isProductionLike } from './node-env';

describe('isProductionLike (ADR-0164)', () => {
  it.each([undefined, null, '', '  ', 'production', 'PRODUCTION', 'staging'])(
    '%p считается production',
    (value) => {
      expect(isProductionLike(value)).toBe(true);
    },
  );

  it.each(['development', 'test', ' Development '])(
    '%p — явное dev/test окружение',
    (value) => {
      expect(isProductionLike(value)).toBe(false);
    },
  );
});
