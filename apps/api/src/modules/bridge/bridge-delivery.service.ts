import { Inject, Injectable, Logger } from '@nestjs/common';
import { BridgeDeliveryJobStatus, Prisma } from '@prisma/client';
import {
  EXTRA_ROOTS_SETTING,
  normalizeRoots,
  validateRenderedCommand,
} from '../delivery/command-template';
import { PrismaService } from '../prisma/prisma.service';
import {
  BRIDGE_CONFIG,
  BridgeConfig,
  isBridgeOperational,
} from './bridge.config';
import { DeliveryAckStatus } from './bridge.constants';
import { resolveCapabilities } from './bridge-capabilities';

/// Очередь заданий выдачи для плагина Bridge (0.13, ADR-0194). Модуль Bridge
/// НЕ знает про DeliveryService: исполнитель доставки кладёт задания сюда, а
/// исход возвращается либо опросом строки, либо слушателем (поздний ack).
///
/// Инварианты безопасности:
///  - сервер получает только QUEUED-задания СВОЕГО `serverSlug`, и только пока
///    задание выдачи в статусе IN_PROGRESS с той же попыткой (закрытое
///    вручную, отменённое при возврате или перешедшее в ожидание задание
///    плагину не отдаётся);
///  - подтверждение принимается только по `claimToken` и только от сервера
///    владельца задания; чужое и несуществующее неразличимы (`unknown_job`);
///  - команда повторно проверяется по белому списку при выдаче плагину;
///  - плагину в ответ не уходит ничего, кроме команды и идентификаторов.

export type JobSnapshot = {
  id: string;
  taskId: string;
  attempt: number;
  idempotencyKey: string;
  serverSlug: string;
  status: BridgeDeliveryJobStatus;
  ackCode: string | null;
  claimedAt: Date | null;
};

export type EnqueueInput = {
  idempotencyKey: string;
  taskId: string;
  attempt: number;
  serverSlug: string;
  command: string;
  /// Сколько задание остаётся доступным для захвата.
  ttlMs: number;
};

/// Окно, в течение которого захваченное, но не подтверждённое задание
/// считается «в полёте» и не ставится в очередь заново.
export const CLAIM_IN_FLIGHT_MS = 60_000;

export type ClaimedJob = {
  jobId: string;
  idempotencyKey: string;
  command: string;
  claimToken: string;
};

export type AckInput = {
  jobId: string;
  claimToken: string;
  status: DeliveryAckStatus;
  code: string | null;
};

export type AckOutcome =
  | { jobId: string; status: 'accepted' | 'duplicate' }
  | {
      jobId: string;
      status: 'rejected';
      code: 'unknown_job' | 'token_mismatch' | 'conflict' | 'not_claimed';
    };

export type SettledListener = (job: JobSnapshot) => void | Promise<void>;

const SNAPSHOT_SELECT = {
  id: true,
  taskId: true,
  attempt: true,
  idempotencyKey: true,
  serverSlug: true,
  status: true,
  ackCode: true,
  claimedAt: true,
} as const;

const ACK_TO_STATUS: Record<DeliveryAckStatus, BridgeDeliveryJobStatus> = {
  done: BridgeDeliveryJobStatus.DONE,
  failed: BridgeDeliveryJobStatus.FAILED,
  unknown: BridgeDeliveryJobStatus.UNKNOWN,
  // «Не выполнено, можно позже»: строка закрывается как CANCELLED.
  retry: BridgeDeliveryJobStatus.CANCELLED,
};

@Injectable()
export class BridgeDeliveryService {
  private readonly logger = new Logger(BridgeDeliveryService.name);
  private readonly listeners = new Set<SettledListener>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(BRIDGE_CONFIG) private readonly config: BridgeConfig,
  ) {}

  /// Выдача через Bridge работает только при включённом приёмнике, годном
  /// секрете и `BRIDGE_DELIVERY_ENABLED=true` (fail closed).
  isOperational(): boolean {
    return isBridgeOperational(this.config) && this.config.deliveryEnabled;
  }

  onSettled(listener: SettledListener): void {
    this.listeners.add(listener);
  }

  async getByKey(idempotencyKey: string): Promise<JobSnapshot | null> {
    return this.prisma.bridgeDeliveryJob.findUnique({
      where: { idempotencyKey },
      select: SNAPSHOT_SELECT,
    });
  }

  async getById(id: string): Promise<JobSnapshot | null> {
    return this.prisma.bridgeDeliveryJob.findUnique({
      where: { id },
      select: SNAPSHOT_SELECT,
    });
  }

  /// Ставит задание в очередь идемпотентно по ключу (одна строка на задание
  /// выдачи). Повторная постановка:
  ///  - DONE: ничего не меняется (исполнитель вернёт `delivered`);
  ///  - QUEUED/CANCELLED/FAILED: строка возвращается в QUEUED;
  ///  - CLAIMED/UNKNOWN: сюда попадает только явный повтор админа (автоповтор
  ///    после них невозможен); CLAIMED моложе `CLAIM_IN_FLIGHT_MS` не
  ///    трогается. Ключ тот же, поэтому плагин обязан отвечать `done` на уже
  ///    выполненный ключ, а не выполнять команду второй раз.
  async enqueue(
    input: EnqueueInput,
    now: Date = new Date(),
  ): Promise<JobSnapshot> {
    const expiresAt = new Date(now.getTime() + input.ttlMs);
    try {
      return await this.prisma.bridgeDeliveryJob.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          taskId: input.taskId,
          attempt: input.attempt,
          serverSlug: input.serverSlug,
          command: input.command,
          expiresAt,
        },
        select: SNAPSHOT_SELECT,
      });
    } catch (error) {
      if (!(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )) {
        throw error;
      }
    }
    const current = await this.getByKey(input.idempotencyKey);
    if (current === null) throw new Error('bridge_job_vanished');
    if (current.status === BridgeDeliveryJobStatus.DONE) return current;
    const inFlight =
      current.status === BridgeDeliveryJobStatus.CLAIMED &&
      current.claimedAt !== null &&
      now.getTime() - current.claimedAt.getTime() < CLAIM_IN_FLIGHT_MS;
    if (inFlight) return current;
    // CAS по прочитанному статусу: параллельный захват/ack не затирается.
    const moved = await this.prisma.bridgeDeliveryJob.updateMany({
      where: { id: current.id, status: current.status },
      data: {
        status: BridgeDeliveryJobStatus.QUEUED,
        attempt: input.attempt,
        serverSlug: input.serverSlug,
        command: input.command,
        expiresAt,
        claimToken: null,
        claimedAt: null,
        ackCode: null,
        ackedAt: null,
      },
    });
    if (moved.count !== 1) {
      const raced = await this.getByKey(input.idempotencyKey);
      if (raced === null) throw new Error('bridge_job_vanished');
      return raced;
    }
    const fresh = await this.getByKey(input.idempotencyKey);
    if (fresh === null) throw new Error('bridge_job_vanished');
    return fresh;
  }

  /// Отмена НЕЗАХВАЧЕННОГО задания (сервер не получил команду). 1 — отменено,
  /// 0 — задание уже захвачено или закрыто: исход надо читать заново.
  async cancelIfQueued(id: string): Promise<boolean> {
    const res = await this.prisma.bridgeDeliveryJob.updateMany({
      where: { id, status: BridgeDeliveryJobStatus.QUEUED },
      data: {
        status: BridgeDeliveryJobStatus.CANCELLED,
        ackCode: 'not_claimed',
        ackedAt: new Date(),
      },
    });
    return res.count === 1;
  }

  /// Сервер забирает задания (атомарно, `FOR UPDATE SKIP LOCKED`): одно
  /// задание не может уйти двум запросам. Порядок — по времени создания.
  async claim(
    serverSlug: string,
    max: number,
    now: Date = new Date(),
  ): Promise<ClaimedJob[]> {
    // Опрос плагина - признак «сервер на связи» (не чаще раза в 30 с).
    await this.prisma.bridgeServer.updateMany({
      where: {
        slug: serverSlug,
        OR: [
          { lastSeenAt: null },
          { lastSeenAt: { lt: new Date(now.getTime() - 30_000) } },
        ],
      },
      data: { lastSeenAt: now },
    });
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        idempotencyKey: string;
        command: string;
        claimToken: string;
      }[]
    >(Prisma.sql`
      UPDATE bridge_delivery_jobs AS j
      SET status = 'CLAIMED'::"BridgeDeliveryJobStatus",
          "claimToken" = gen_random_uuid()::text,
          "claimCount" = j."claimCount" + 1,
          "claimedAt" = ${now},
          "updatedAt" = ${now}
      WHERE j.id IN (
        SELECT c.id FROM bridge_delivery_jobs c
        JOIN delivery_tasks t ON t.id = c."taskId"
        WHERE c."serverSlug" = ${serverSlug}
          AND c.status = 'QUEUED'::"BridgeDeliveryJobStatus"
          AND c."expiresAt" > ${now}
          AND t.status = 'IN_PROGRESS'::"DeliveryTaskStatus"
          AND t.attempts = c.attempt
        ORDER BY c."createdAt", c.id
        LIMIT ${max}
        FOR UPDATE OF c SKIP LOCKED
      )
      RETURNING j.id, j."idempotencyKey", j.command, j."claimToken"`);
    if (rows.length === 0) return [];

    // Страховка: команда повторно проходит белый список. Негодную (подмену
    // строки в БД) плагину не отдаём и закрываем как FAILED.
    const extraRoots = await this.extraRoots();
    const out: ClaimedJob[] = [];
    for (const row of rows) {
      try {
        validateRenderedCommand(row.command, extraRoots);
      } catch {
        this.logger.error(`bridge delivery: command_invalid job=${row.id}`);
        await this.settle(row.id, row.claimToken, 'failed', 'command_invalid');
        continue;
      }
      out.push({
        jobId: row.id,
        idempotencyKey: row.idempotencyKey,
        command: row.command,
        claimToken: row.claimToken,
      });
    }
    return out;
  }

  /// Подтверждение результата сервером. Идемпотентно: повтор с тем же
  /// статусом — `duplicate`. Чужое и несуществующее задание неразличимы.
  async ack(serverSlug: string, input: AckInput): Promise<AckOutcome> {
    const job = await this.prisma.bridgeDeliveryJob.findFirst({
      where: { id: input.jobId, serverSlug },
      select: { ...SNAPSHOT_SELECT, claimToken: true },
    });
    if (job === null) {
      return { jobId: input.jobId, status: 'rejected', code: 'unknown_job' };
    }
    if (job.claimToken === null) {
      return { jobId: input.jobId, status: 'rejected', code: 'not_claimed' };
    }
    if (job.claimToken !== input.claimToken) {
      return { jobId: input.jobId, status: 'rejected', code: 'token_mismatch' };
    }
    const target = ACK_TO_STATUS[input.status];
    if (job.status !== BridgeDeliveryJobStatus.CLAIMED) {
      // Уже закрыто: тот же исход — дубль, иной — конфликт.
      return job.status === target
        ? { jobId: input.jobId, status: 'duplicate' }
        : { jobId: input.jobId, status: 'rejected', code: 'conflict' };
    }
    const moved = await this.settle(
      job.id,
      input.claimToken,
      input.status,
      input.code,
    );
    if (!moved) {
      const again = await this.getById(job.id);
      return again?.status === target
        ? { jobId: input.jobId, status: 'duplicate' }
        : { jobId: input.jobId, status: 'rejected', code: 'conflict' };
    }
    return { jobId: input.jobId, status: 'accepted' };
  }

  /// CLAIMED -> исход (CAS по токену) и уведомление слушателей.
  private async settle(
    id: string,
    claimToken: string,
    status: DeliveryAckStatus,
    code: string | null,
  ): Promise<boolean> {
    const res = await this.prisma.bridgeDeliveryJob.updateMany({
      where: { id, claimToken, status: BridgeDeliveryJobStatus.CLAIMED },
      data: {
        status: ACK_TO_STATUS[status],
        ackCode: code,
        ackedAt: new Date(),
      },
    });
    if (res.count !== 1) return false;
    const snapshot = await this.getById(id);
    if (snapshot !== null) await this.notify(snapshot);
    return true;
  }

  private async notify(job: JobSnapshot): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener(job);
      } catch {
        // Исход уже записан; поздний перенос в задание не должен ломать ack.
        this.logger.warn(`bridge delivery: listener_failed job=${job.id}`);
      }
    }
  }

  /// Живость сервера для исполнителя: ACTIVE, разрешена выдача, виден недавно.
  async serverState(
    slug: string,
    livenessMs: number,
    now: Date = new Date(),
  ): Promise<
    'ok' | 'unknown_server' | 'inactive' | 'no_capability' | 'offline'
  > {
    const server = await this.prisma.bridgeServer.findUnique({
      where: { slug },
      select: { status: true, capabilities: true, lastSeenAt: true },
    });
    if (server === null) return 'unknown_server';
    if (server.status !== 'ACTIVE') return 'inactive';
    const allowed = resolveCapabilities(server.capabilities).has('delivery');
    if (!allowed) return 'no_capability';
    if (
      server.lastSeenAt === null ||
      now.getTime() - server.lastSeenAt.getTime() > livenessMs
    ) {
      return 'offline';
    }
    return 'ok';
  }

  private async extraRoots(): Promise<string[]> {
    const row = await this.prisma.siteSetting.findUnique({
      where: { key: EXTRA_ROOTS_SETTING },
      select: { value: true },
    });
    try {
      return normalizeRoots(row?.value ?? '');
    } catch {
      return [];
    }
  }
}
