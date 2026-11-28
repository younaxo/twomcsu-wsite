import { BadRequestException } from '@nestjs/common';
import { CommunicationsService } from './communications.service';
import { MailingsService } from './mailings.service';

const audience = { kind: 'users', userIds: ['u1', 'u2'] } as const;
const dto = {
  title: 'Заголовок',
  message: 'Текст',
  audience,
  confirmCount: 2,
} as never;

function setup(queueEnabled: boolean, targets: string[] = ['u1', 'u2']) {
  const prisma = {
    user: {
      findMany: jest.fn(async () => targets.map((id) => ({ id }))),
      count: jest.fn(async () => targets.length),
    },
  };
  const notifications = { create: jest.fn(async () => ({ id: 'n' })) };
  const audit = { log: jest.fn(async () => undefined) };
  const mailings = {
    queueEnabled,
    enqueue: jest.fn(async () => ({ id: 'job1', total: targets.length })),
  };
  const service = new CommunicationsService(
    prisma as never,
    notifications as never,
    audit as never,
    {} as never,
    mailings as never,
  );
  return { service, prisma, notifications, audit, mailings };
}

describe('CommunicationsService.sendBulk', () => {
  it('флаг очереди включён: ставит задание, delivered=0, синхронной доставки нет', async () => {
    const s = setup(true);
    const result = await s.service.sendBulk(dto, 'actor');
    expect(result).toEqual({ recipients: 2, delivered: 0, mailingId: 'job1' });
    expect(s.mailings.enqueue).toHaveBeenCalledWith(dto, 'actor');
    expect(s.notifications.create).not.toHaveBeenCalled();
    expect(s.prisma.user.findMany).not.toHaveBeenCalled();
    expect(s.audit.log).not.toHaveBeenCalled();
  });

  it('флаг выключен: прежний синхронный ответ {recipients, delivered}', async () => {
    const s = setup(false);
    const result = await s.service.sendBulk(dto, 'actor');
    expect(result).toEqual({ recipients: 2, delivered: 2 });
    expect(s.mailings.enqueue).not.toHaveBeenCalled();
    expect(s.notifications.create).toHaveBeenCalledTimes(2);
    expect(s.audit.log).toHaveBeenCalledTimes(1);
  });
});

describe('MailingsService: скорость и пустая аудитория', () => {
  const make = (raw: unknown, count = 0) =>
    new MailingsService(
      { user: { count: jest.fn(async () => count) } } as never,
      {} as never,
      {} as never,
      { get: jest.fn(() => raw) } as never,
    );

  it.each([
    [0, 20],
    [-1, 20],
    ['abc', 20],
    [NaN, 20],
    [undefined, 20],
    [5, 5],
    [7.9, 7],
  ])('MAILING_RATE_PER_SEC=%p -> %p', (raw, expected) => {
    expect(make(raw).ratePerSec).toBe(expected);
  });

  it('пустая аудитория: 400 «Нет получателей», задание не создаётся', async () => {
    await expect(make(undefined, 0).enqueue(dto, 'actor')).rejects.toThrow(
      BadRequestException,
    );
  });
});
