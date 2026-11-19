import { ServiceUnavailableException } from '@nestjs/common';
import { RegistrationService } from './registration.service';

/// Отказ при ошибке отправки письма с кодом: fail-closed по NODE_ENV (ADR-0164).
function makeService(nodeEnv: string | undefined) {
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = { emailVerification: { deleteMany } };
  const config = {
    get: (key: string, fallback?: unknown) =>
      key === 'NODE_ENV' ? nodeEnv : fallback,
  };
  const email = {
    send: jest.fn().mockRejectedValue(new Error('smtp down')),
    sendMail: jest.fn().mockRejectedValue(new Error('smtp down')),
  };
  const service = new RegistrationService(
    prisma as never,
    config as never,
    email as never,
    {} as never,
    {} as never,
    {} as never,
  );
  jest
    .spyOn(
      service as never as { deliverCode: () => Promise<void> },
      'deliverCode',
    )
    .mockRejectedValue(new Error('smtp down'));
  const sendCode = (
    service as never as {
      sendCode: (e: string, c: string, id: string) => Promise<void>;
    }
  ).sendCode.bind(service);
  return { sendCode, deleteMany };
}

describe('RegistrationService.sendCode: ошибка почты', () => {
  it.each([undefined, '', 'production', 'staging'])(
    'NODE_ENV=%p: 503 mail_failed, запрос подтверждения удаляется',
    async (env) => {
      const { sendCode, deleteMany } = makeService(env);
      await expect(sendCode('a@b.c', '123456', 'v1')).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(deleteMany).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['development', 'test'])(
    'NODE_ENV=%p: ошибка проглатывается (код в dev-логе)',
    async (env) => {
      const { sendCode, deleteMany } = makeService(env);
      await expect(sendCode('a@b.c', '123456', 'v1')).resolves.toBeUndefined();
      expect(deleteMany).not.toHaveBeenCalled();
    },
  );
});
