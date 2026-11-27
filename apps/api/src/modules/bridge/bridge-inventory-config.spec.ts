import { envValidationSchema } from '../../config/env.validation';
import { readBridgeConfig } from './bridge.config';

/// `BRIDGE_INVENTORY_ENABLED` (раздел 16.1 контракта): fail closed. Joi
/// валидирует строго (опечатка - ошибка старта), читатель конфигурации
/// считает включённым только `true` / строку `true`.
const base = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  TURNSTILE_DISABLED: 'true',
};

const reader = (value: unknown) => ({
  get: (key: string) =>
    key === 'BRIDGE_INVENTORY_ENABLED' ? (value as never) : undefined,
});

describe('readBridgeConfig: inventoryEnabled', () => {
  it.each([
    [true, true],
    ['true', true],
    ['TRUE', true],
    [false, false],
    ['false', false],
    [undefined, false],
    ['', false],
    ['1', false],
    ['yes', false],
    ['мусор', false],
    [{}, false],
  ])('значение %p -> %p', (value, expected) => {
    expect(readBridgeConfig(reader(value)).inventoryEnabled).toBe(expected);
  });
});

describe('envValidationSchema: BRIDGE_INVENTORY_ENABLED', () => {
  it('по умолчанию выключен', () => {
    const { error, value } = envValidationSchema.validate(base, {
      allowUnknown: true,
    });
    expect(error).toBeUndefined();
    expect(value.BRIDGE_INVENTORY_ENABLED).toBe(false);
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('принимает %p и приводит к булеву', (raw, expected) => {
    const { error, value } = envValidationSchema.validate(
      { ...base, BRIDGE_INVENTORY_ENABLED: raw },
      { allowUnknown: true },
    );
    expect(error).toBeUndefined();
    expect(value.BRIDGE_INVENTORY_ENABLED).toBe(expected);
  });

  it.each(['flase', '1', 'yes', 'мусор'])(
    'отвергает опечатку %p: ошибка старта',
    (raw) => {
      const { error } = envValidationSchema.validate(
        { ...base, BRIDGE_INVENTORY_ENABLED: raw },
        { allowUnknown: true },
      );
      expect(error).toBeDefined();
      expect(error?.message).toMatch(/BRIDGE_INVENTORY_ENABLED/);
    },
  );
});
