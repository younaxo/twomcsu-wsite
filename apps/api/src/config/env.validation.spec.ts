import { envValidationSchema } from './env.validation';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  TURNSTILE_DISABLED: 'true',
};

describe('envValidationSchema TRUST_PROXY', () => {
  it.each(['true', '*', '0.0.0.0/0', '::/0', '0', '-1'])(
    'отвергает %p',
    (value) => {
      const { error } = envValidationSchema.validate(
        { ...base, TRUST_PROXY: value },
        { allowUnknown: true },
      );
      expect(error).toBeDefined();
      expect(error?.message).toMatch(/TRUST_PROXY/);
    },
  );

  it.each(['', '1', 'loopback'])('принимает %p', (value) => {
    const { error } = envValidationSchema.validate(
      { ...base, TRUST_PROXY: value },
      { allowUnknown: true },
    );
    expect(error).toBeUndefined();
  });
});
