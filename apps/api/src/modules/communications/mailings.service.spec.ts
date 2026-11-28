import { MailingJobStatus } from '@prisma/client';
import {
  LeaderLock,
  LeaderLockClient,
} from '../punishments/punishments-leader-lock';
import { MailingsScheduler } from './mailings.scheduler';
import { MAILING_BATCH_SIZE, MailingsService } from './mailings.service';

type Row = Record<string, any>;

/// БД в памяти: ровно те операции, что использует воркер.
class FakeDb {
  users: string[] = [];
  jobs: Row[] = [];
  notifications: Array<{ userId: string; metadata: Row }> = [];
  /// Хук между доставкой и записью прогресса (имитация отмены/гонки).
  beforeProgress: ((job: Row) => void) | null = null;

  mailingJob = {
    create: async ({ data }: { data: Row }) => {
      const job = {
        id: `job${this.jobs.length + 1}`,
        status: 'QUEUED',
        processed: 0,
        delivered: 0,
        skipped: 0,
        failed: 0,
        cursor: null,
        lastError: null,
        link: null,
        cancelledById: null,
        cancelledAt: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(this.jobs.length),
        ...data,
      };
      this.jobs.push(job);
      return { ...job };
    },
    findFirst: async ({ where }: { where: Row }) => {
      const found = this.jobs.find((j) => where.status.in.includes(j.status));
      return found ? { ...found } : null;
    },
    findUnique: async ({ where }: { where: Row }) => {
      const found = this.jobs.find((j) => j.id === where.id);
      return found ? { ...found } : null;
    },
    findMany: async () => this.jobs.map((j) => ({ ...j })),
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const job = this.jobs.find((j) => j.id === where.id);
      if (!job) return { count: 0 };
      if (where.status) {
        const allowed = where.status.in ?? [where.status];
        if (!allowed.includes(job.status)) return { count: 0 };
      }
      if ('cursor' in where && job.cursor !== where.cursor) {
        return { count: 0 };
      }
      if (data.cursor !== undefined) this.beforeProgress?.(job);
      // Хук мог отменить задание: CAS проверяется заново.
      if (
        where.status &&
        !(where.status.in ?? [where.status]).includes(job.status)
      ) {
        return { count: 0 };
      }
      for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === 'object' && 'increment' in value) {
          job[key] += (value as Row).increment;
        } else {
          job[key] = value;
        }
      }
      return { count: 1 };
    },
  };

  user = {
    findMany: async ({ where, take }: { where: Row; take: number }) => {
      const gt = (where.AND as Row[]).find((c) => c.id?.gt)?.id.gt as
        string | undefined;
      return this.users
        .filter((id) => !gt || id > gt)
        .sort()
        .slice(0, take)
        .map((id) => ({ id }));
    },
    count: async () => this.users.length,
  };

  notification = {
    findMany: async ({ where }: { where: Row }) =>
      this.notifications.filter(
        (n) =>
          where.userId.in.includes(n.userId) &&
          n.metadata.mailingId === where.metadata.equals,
      ),
  };
}

function setup(failFor: Set<string> = new Set()) {
  const db = new FakeDb();
  const notifications = {
    create: jest.fn(async (input: Row) => {
      if (failFor.has(input.userId)) throw new Error('boom');
      db.notifications.push({ userId: input.userId, metadata: input.metadata });
      return { id: 'n' };
    }),
  };
  const audit = { log: jest.fn(async () => undefined) };
  const config = { get: jest.fn(() => undefined) };
  const make = () =>
    new MailingsService(
      db as never,
      notifications as never,
      audit as never,
      config as never,
    );
  return { db, notifications, audit, make, service: make() };
}

async function enqueue(s: ReturnType<typeof setup>, count: number) {
  s.db.users = Array.from(
    { length: count },
    (_, i) => `u${String(i).padStart(4, '0')}`,
  );
  return s.service.enqueue(
    {
      title: 'T',
      message: 'M',
      audience: { kind: 'all' },
      confirmCount: count,
    } as never,
    'admin1',
  );
}

describe('MailingsService (фоновая рассылка)', () => {
  it('enqueue: задание QUEUED + аудит, без отправки', async () => {
    const s = setup();
    const job = await enqueue(s, 5);
    expect(job.status).toBe(MailingJobStatus.QUEUED);
    expect(job.total).toBe(5);
    expect(s.notifications.create).not.toHaveBeenCalled();
    expect(s.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin1',
        action: 'communications.mailing.create',
      }),
    );
  });

  it('enqueue: неверный confirmCount -> 409', async () => {
    const s = setup();
    s.db.users = ['a', 'b'];
    await expect(
      s.service.enqueue(
        {
          title: 'T',
          message: 'M',
          audience: { kind: 'all' },
          confirmCount: 3,
        } as never,
        'admin1',
      ),
    ).rejects.toThrow(/изменилось/);
  });

  it('лимит скорости: за тик не больше бюджета, затем продолжение', async () => {
    const s = setup();
    await enqueue(s, 120);
    expect(await s.service.processDue(30)).toBe(30);
    expect(s.notifications.create).toHaveBeenCalledTimes(30);
    expect(s.db.jobs[0].status).toBe('RUNNING');
    expect(await s.service.processDue(100)).toBe(90);
    expect(s.db.jobs[0].status).toBe('DONE');
    expect(s.db.jobs[0]).toMatchObject({ processed: 120, delivered: 120 });
    expect(s.db.notifications).toHaveLength(120);
  });

  it('бюджет больше пачки делится на пачки по MAILING_BATCH_SIZE', async () => {
    const s = setup();
    await enqueue(s, MAILING_BATCH_SIZE * 2 + 1);
    await s.service.processDue(1000);
    expect(s.db.jobs[0].status).toBe('DONE');
    expect(s.db.jobs[0].processed).toBe(MAILING_BATCH_SIZE * 2 + 1);
  });

  it('рестарт посередине: новый экземпляр продолжает с курсора без дублей', async () => {
    const s = setup();
    await enqueue(s, 120);
    await s.service.processDue(50);
    const restarted = s.make();
    await restarted.processDue(1000);
    const perUser = new Map<string, number>();
    for (const n of s.db.notifications) {
      perUser.set(n.userId, (perUser.get(n.userId) ?? 0) + 1);
    }
    expect(perUser.size).toBe(120);
    expect([...perUser.values()].every((c) => c === 1)).toBe(true);
    expect(s.db.jobs[0].status).toBe('DONE');
  });

  it('сбой между доставкой и записью прогресса: повтор пачки не дублирует', async () => {
    const s = setup();
    await enqueue(s, 20);
    // Пачка доставлена, но курсор не записан (процесс упал): имитируем
    // уведомлениями без продвижения курсора.
    for (const id of s.db.users.slice(0, 7)) {
      s.db.notifications.push({
        userId: id,
        metadata: { mailingId: 'job1', sender: 'system' },
      });
    }
    await s.service.processDue(1000);
    expect(s.db.notifications).toHaveLength(20);
    expect(s.db.jobs[0]).toMatchObject({
      status: 'DONE',
      skipped: 7,
      delivered: 13,
      processed: 20,
    });
  });

  it('повторный вход в завершённое задание ничего не отправляет', async () => {
    const s = setup();
    await enqueue(s, 10);
    await s.service.processDue(1000);
    s.notifications.create.mockClear();
    expect(await s.service.processDue(1000)).toBe(0);
    expect(s.notifications.create).not.toHaveBeenCalled();
  });

  it('отмена: воркер останавливается, остаток не отправляется, аудит с кем', async () => {
    const s = setup();
    await enqueue(s, 120);
    await s.service.processDue(50);
    const cancelled = await s.service.cancel('job1', 'admin2');
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelledById).toBe('admin2');
    expect(await s.service.processDue(1000)).toBe(0);
    expect(s.db.notifications).toHaveLength(50);
    expect(s.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin2',
        action: 'communications.mailing.cancel',
      }),
    );
    await expect(s.service.cancel('job1', 'admin2')).rejects.toThrow(
      /уже завершена/,
    );
  });

  it('отмена во время пачки: прогресс пачки не записывается поверх отмены', async () => {
    const s = setup();
    await enqueue(s, 60);
    s.db.beforeProgress = (job) => {
      job.status = 'CANCELLED';
    };
    await s.service.processDue(1000);
    expect(s.db.jobs[0].status).toBe('CANCELLED');
    expect(s.db.jobs[0].processed).toBe(0);
  });

  it('потеря лидерства между пачками останавливает воркер', async () => {
    const s = setup();
    await enqueue(s, 200);
    let calls = 0;
    const spent = await s.service.processDue(1000, async () => ++calls <= 1);
    expect(spent).toBe(MAILING_BATCH_SIZE);
  });

  it('все получатели с ошибкой -> FAILED; частичные ошибки -> DONE', async () => {
    const all = setup(new Set(['u0000', 'u0001']));
    await enqueue(all, 2);
    await all.service.processDue(100);
    expect(all.db.jobs[0]).toMatchObject({ status: 'FAILED', failed: 2 });

    const part = setup(new Set(['u0000']));
    await enqueue(part, 3);
    await part.service.processDue(100);
    expect(part.db.jobs[0]).toMatchObject({
      status: 'DONE',
      failed: 1,
      delivered: 2,
    });
  });

  it('задания идут по очереди создания', async () => {
    const s = setup();
    await enqueue(s, 3);
    await s.service.enqueue(
      {
        title: 'T2',
        message: 'M2',
        audience: { kind: 'all' },
        confirmCount: 3,
      } as never,
      'admin1',
    );
    await s.service.processDue(4);
    expect(s.db.jobs[0].status).toBe('DONE');
    expect(s.db.jobs[1]).toMatchObject({ status: 'RUNNING', processed: 1 });
  });
});

class FakeRedis implements LeaderLockClient {
  data = new Map<string, string>();
  async set(key: string, value: string): Promise<'OK' | null> {
    if (this.data.has(key)) return null;
    this.data.set(key, value);
    return 'OK';
  }
  async eval(script: string, _n: number, ...args: string[]) {
    const [key, token] = args;
    const cur = this.data.get(key);
    if (script.includes('pexpire')) return cur === token ? 1 : 0;
    if (cur === token) {
      this.data.delete(key);
      return 1;
    }
    return 0;
  }
}

describe('MailingsScheduler (блокировка лидера)', () => {
  function build(redis: FakeRedis) {
    const processDue = jest.fn(async () => 7);
    const mailings = {
      processDue,
      ratePerSec: 20,
    } as unknown as MailingsService;
    const scheduler = new MailingsScheduler(mailings, {} as never);
    scheduler.useLock(new LeaderLock(redis, 'k', 10_000));
    return { scheduler, processDue };
  }

  it('только один из двух экземпляров обрабатывает задания', async () => {
    const redis = new FakeRedis();
    const a = build(redis);
    const b = build(redis);
    expect(await a.scheduler.tick()).toBe(7);
    expect(await b.scheduler.tick()).toBe(0);
    expect(a.processDue).toHaveBeenCalledTimes(1);
    expect(b.processDue).not.toHaveBeenCalled();
    await a.scheduler.onModuleDestroy();
    // после освобождения лидерство переходит ко второму
    expect(await b.scheduler.tick()).toBe(7);
    await b.scheduler.onModuleDestroy();
  });

  it('бюджет тика = rate * период; ошибка воркера не роняет тик', async () => {
    const redis = new FakeRedis();
    const a = build(redis);
    await a.scheduler.tick();
    expect(a.processDue).toHaveBeenCalledWith(40, expect.any(Function));
    a.processDue.mockRejectedValueOnce(new Error('db down'));
    expect(await a.scheduler.tick()).toBe(0);
    await a.scheduler.onModuleDestroy();
  });
});
