import { FormVisibility } from '@prisma/client';
import { FormsService } from './forms.service';

function setup() {
  const form = {
    id: 'f1',
    slug: 'apply',
    status: 'PUBLISHED',
    visibility: FormVisibility.PUBLIC,
    requiresAuth: false,
    requiresCaptcha: false,
    onePerUser: false,
    opensAt: null,
    closesAt: null,
    maxResponses: null,
    responsesCount: 0,
    fields: [],
  };
  const response = {
    id: 'r1',
    isComplete: true,
    isAnonymous: true,
    completedAt: new Date(),
  };
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    form: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ responsesCount: 0, maxResponses: null }),
      update: jest.fn().mockResolvedValue({}),
    },
    formResponse: {
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn().mockResolvedValue(response),
    },
    formInvite: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
  };
  const prisma = {
    form: { findUnique: jest.fn().mockResolvedValue(form) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const service = new FormsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    { get: jest.fn(() => '') } as never,
  );
  return { service, prisma, tx, response };
}

describe('FormsService.submitResponse (ADR-0162)', () => {
  it('транзакция отправки: maxWait и timeout 10 с, блокировка берётся внутри', async () => {
    const { service, prisma, tx, response } = setup();

    const result = await service.submitResponse(
      'apply',
      null,
      { answers: [] } as never,
      undefined,
      undefined,
    );

    expect(result).toBe(response);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 10_000,
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.form.update).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { responsesCount: { increment: 1 } },
    });
  });
});

const KEY = 'k'.repeat(32);

function visibilitySetup(env: { key?: string; nodeEnv?: string }) {
  const hasPermission = jest.fn().mockResolvedValue(true);
  const config = {
    get: (name: string, def?: string) =>
      name === 'TWO_FACTOR_ENCRYPTION_KEY'
        ? (env.key ?? def)
        : name === 'NODE_ENV'
          ? env.nodeEnv
          : def,
  };
  const service = new FormsService(
    {} as never,
    { hasPermission } as never,
    {} as never,
    {} as never,
    config as never,
  );
  return { service, hasPermission };
}

describe('FormsService.canView и 2FA персонала (Q22, ADR-0169)', () => {
  it('ключ задан, персонал без 2FA: видимость игрока, право не проверяется', async () => {
    const { service, hasPermission } = visibilitySetup({ key: KEY });
    const viewer = { id: 'u1', twoFactorEnabled: false };
    expect(await service.canView(FormVisibility.ADMIN_ONLY, viewer)).toBe(
      false,
    );
    expect(await service.canView(FormVisibility.PUBLIC, viewer)).toBe(true);
    expect(await service.canView(FormVisibility.AUTHENTICATED, viewer)).toBe(
      true,
    );
    expect(hasPermission).not.toHaveBeenCalled();
  });

  it('ключ задан, персонал с 2FA: расширенная видимость', async () => {
    const { service, hasPermission } = visibilitySetup({ key: KEY });
    const viewer = { id: 'u1', twoFactorEnabled: true };
    expect(await service.canView(FormVisibility.ADMIN_ONLY, viewer)).toBe(true);
    expect(hasPermission).toHaveBeenCalledWith('u1', 'forms.view.admin');
  });

  it('без ключа в явном development: как раньше', async () => {
    const { service } = visibilitySetup({ nodeEnv: 'development' });
    expect(await service.canView(FormVisibility.ADMIN_ONLY, { id: 'u1' })).toBe(
      true,
    );
  });

  it('без ключа в production: fail closed, видимость игрока', async () => {
    const { service } = visibilitySetup({ nodeEnv: 'production' });
    expect(await service.canView(FormVisibility.ADMIN_ONLY, { id: 'u1' })).toBe(
      false,
    );
  });
});
