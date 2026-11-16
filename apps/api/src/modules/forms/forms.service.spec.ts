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
