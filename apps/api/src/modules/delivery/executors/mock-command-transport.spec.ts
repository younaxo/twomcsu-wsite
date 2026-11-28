import { MockCommandTransport } from './mock-command-transport';

describe('MockCommandTransport: fail closed вне тестов (R143)', () => {
  it.each([undefined, '', 'production', 'development', 'staging'])(
    'NODE_ENV=%p: конструктор бросает ошибку',
    (env) => {
      expect(() => new MockCommandTransport(env)).toThrow(/NODE_ENV=test/);
    },
  );

  it('NODE_ENV=test: создаётся', () => {
    expect(new MockCommandTransport('test').dedupAck).toBe(true);
  });

  it('по умолчанию читает process.env.NODE_ENV (jest: test)', () => {
    expect(() => new MockCommandTransport()).not.toThrow();
  });
});
