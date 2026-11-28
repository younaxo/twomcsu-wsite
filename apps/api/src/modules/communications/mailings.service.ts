import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MailingJob,
  MailingJobStatus,
  NotificationPriority,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BulkSystemMessageDto,
  SystemMessageAudienceDto,
} from './dto/system-message.dto';
import { audienceWhere } from './mailing-audience';

/// Защищённый отправитель (зеркало `SYSTEM_MESSAGE_SENDER` из shared).
const SYSTEM_SENDER = 'system';

/// Получателей в одной пачке (курсорная выборка + одна проверка дублей).
export const MAILING_BATCH_SIZE = 50;
/// Скорость по умолчанию: получателей в секунду на экземпляр-лидер.
export const MAILING_DEFAULT_RATE_PER_SEC = 20;
/// Период тика воркера; бюджет тика = rate * период.
export const MAILING_TICK_MS = 2_000;

const ACTIVE_STATUSES: MailingJobStatus[] = [
  MailingJobStatus.QUEUED,
  MailingJobStatus.RUNNING,
];

export interface MailingView {
  id: string;
  status: MailingJobStatus;
  title: string;
  audience: string;
  total: number;
  processed: number;
  delivered: number;
  skipped: number;
  failed: number;
  lastError: string | null;
  createdById: string;
  cancelledById: string | null;
  cancelledAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

interface BatchResult {
  /// Сколько получателей обработано пачкой.
  count: number;
  /// Задание завершено этой пачкой.
  finished: boolean;
}

/// Фоновая массовая рассылка системных сообщений (J-08-4, срез 8.6): задание
/// в БД + воркер. Запрос ставит задание и сразу отвечает; доставку ведёт
/// `processDue` (тик планировщика лидера). Продолжение после рестарта — по
/// курсору; повтор пачки не дублирует сообщения (проверка
/// `metadata.mailingId` у получателя), запись прогресса — compare-and-set по
/// курсору и статусу RUNNING (отмена или второй воркер останавливают пачку).
@Injectable()
export class MailingsService {
  private readonly logger = new Logger(MailingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /// Очередь включена и для старого маршрута `messages/bulk` (флаг).
  get queueEnabled(): boolean {
    return this.config.get<string>('COMMUNICATIONS_BULK_QUEUE') === 'true';
  }

  get ratePerSec(): number {
    const raw = Number(this.config.get('MAILING_RATE_PER_SEC'));
    return Number.isFinite(raw) && raw >= 1
      ? Math.floor(raw)
      : MAILING_DEFAULT_RATE_PER_SEC;
  }

  async enqueue(dto: BulkSystemMessageDto, actorId: string) {
    const total = await this.prisma.user.count({
      where: audienceWhere(dto.audience),
    });
    if (total === 0) throw new BadRequestException('Нет получателей');
    if (total !== dto.confirmCount) {
      throw new ConflictException(
        `Число получателей изменилось: ${total} вместо ${dto.confirmCount}. Проверьте ещё раз.`,
      );
    }
    const { audience } = dto;
    const job = await this.prisma.mailingJob.create({
      data: {
        title: dto.title.trim(),
        message: dto.message.trim(),
        link: dto.link || null,
        audienceKind: audience.kind,
        audienceRoleId: audience.kind === 'role' ? audience.roleId : null,
        audienceUserIds:
          audience.kind === 'users' ? (audience.userIds ?? []) : undefined,
        total,
        createdById: actorId,
      },
    });
    await this.audit.log({
      actorId,
      action: 'communications.mailing.create',
      targetType: 'MailingJob',
      targetId: job.id,
      severity: 'warning',
      changes: {
        title: job.title,
        messageLength: job.message.length,
        link: job.link,
        audience: audience.kind,
        ...(audience.kind === 'role' ? { roleId: audience.roleId } : {}),
        ...(audience.kind === 'users' ? { userIds: audience.userIds } : {}),
        recipients: total,
      },
    });
    return this.view(job);
  }

  async list(limit = 20) {
    const jobs = await this.prisma.mailingJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return jobs.map((job) => this.view(job));
  }

  async get(id: string) {
    const job = await this.prisma.mailingJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Рассылка не найдена');
    return this.view(job);
  }

  /// Отмена QUEUED/RUNNING. Уже доставленные сообщения остаются; воркер
  /// останавливается на ближайшей записи прогресса.
  async cancel(id: string, actorId: string) {
    const now = new Date();
    const res = await this.prisma.mailingJob.updateMany({
      where: { id, status: { in: ACTIVE_STATUSES } },
      data: {
        status: MailingJobStatus.CANCELLED,
        cancelledById: actorId,
        cancelledAt: now,
        finishedAt: now,
      },
    });
    const job = await this.prisma.mailingJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Рассылка не найдена');
    if (res.count === 0) {
      throw new ConflictException('Рассылка уже завершена или отменена');
    }
    await this.audit.log({
      actorId,
      action: 'communications.mailing.cancel',
      targetType: 'MailingJob',
      targetId: id,
      severity: 'warning',
      changes: { processed: job.processed, total: job.total },
    });
    return this.view(job);
  }

  /// Один тик воркера: не больше `budget` получателей суммарно (лимит
  /// скорости). `stillLeader` проверяется перед каждой пачкой. Возвращает
  /// число обработанных получателей.
  async processDue(
    budget: number = this.ratePerSec * (MAILING_TICK_MS / 1000),
    stillLeader: () => Promise<boolean> = async () => true,
  ): Promise<number> {
    let left = Math.max(0, Math.floor(budget));
    let spent = 0;
    // Страховка от бесконечного цикла при гонках за одно задание.
    for (let guard = 0; left > 0 && guard < 1000; guard += 1) {
      const job = await this.prisma.mailingJob.findFirst({
        where: { status: { in: ACTIVE_STATUSES } },
        orderBy: { createdAt: 'asc' },
      });
      if (!job) break;
      if (!(await stillLeader())) break;
      const result = await this.processBatch(
        job,
        Math.min(left, MAILING_BATCH_SIZE),
      );
      if (result === null) continue; // состояние сменилось — берём заново
      left -= result.count;
      spent += result.count;
      if (result.count === 0 && !result.finished) break;
    }
    return spent;
  }

  /// Одна пачка. `null` — гонка (отмена/другой воркер), цикл перечитывает.
  private async processBatch(
    job: MailingJob,
    limit: number,
  ): Promise<BatchResult | null> {
    let current = job;
    if (current.status === MailingJobStatus.QUEUED) {
      const claimed = await this.prisma.mailingJob.updateMany({
        where: { id: job.id, status: MailingJobStatus.QUEUED },
        data: { status: MailingJobStatus.RUNNING, startedAt: new Date() },
      });
      if (claimed.count === 0) return null;
      current = { ...job, status: MailingJobStatus.RUNNING };
    }

    const where: Prisma.UserWhereInput = {
      AND: [
        audienceWhere(this.audienceOf(current)),
        ...(current.cursor ? [{ id: { gt: current.cursor } }] : []),
      ],
    };
    const batch = await this.prisma.user.findMany({
      where,
      select: { id: true },
      orderBy: { id: 'asc' },
      take: limit,
    });

    let delivered = 0;
    let skipped = 0;
    let failed = 0;
    let lastError: string | null = null;
    if (batch.length > 0) {
      const ids = batch.map((u) => u.id);
      const existing = await this.prisma.notification.findMany({
        where: {
          userId: { in: ids },
          type: NotificationType.SYSTEM,
          metadata: { path: ['mailingId'], equals: current.id },
        },
        select: { userId: true },
      });
      const already = new Set(existing.map((n) => n.userId));
      for (const id of ids) {
        if (already.has(id)) {
          skipped += 1;
          continue;
        }
        try {
          await this.notifications.create({
            userId: id,
            type: NotificationType.SYSTEM,
            title: current.title,
            message: current.message,
            link: current.link ?? undefined,
            priority: NotificationPriority.HIGH,
            metadata: { sender: SYSTEM_SENDER, mailingId: current.id },
            bypassPreferences: true,
          });
          delivered += 1;
        } catch (error) {
          failed += 1;
          lastError = (error as Error).name.slice(0, 200);
        }
      }
    }

    // Меньше запрошенного — аудитория исчерпана.
    const finished = batch.length < limit;
    // Все получатели завершённого задания с ошибкой — FAILED, иначе DONE.
    const okTotal = current.delivered + current.skipped + delivered + skipped;
    const failedTotal = current.failed + failed;
    const finalStatus =
      failedTotal > 0 && okTotal === 0
        ? MailingJobStatus.FAILED
        : MailingJobStatus.DONE;
    const progressed = await this.prisma.mailingJob.updateMany({
      where: {
        id: current.id,
        status: MailingJobStatus.RUNNING,
        cursor: current.cursor,
      },
      data: {
        cursor: batch.length ? batch[batch.length - 1].id : current.cursor,
        processed: { increment: batch.length },
        delivered: { increment: delivered },
        skipped: { increment: skipped },
        failed: { increment: failed },
        ...(lastError ? { lastError } : {}),
        ...(finished ? { status: finalStatus, finishedAt: new Date() } : {}),
      },
    });
    if (progressed.count === 0) {
      this.logger.warn(`Рассылка ${current.id}: прогресс не записан (отмена?)`);
      return null;
    }
    if (finished) {
      await this.audit.log({
        actorId: current.createdById,
        action: 'communications.mailing.finish',
        targetType: 'MailingJob',
        targetId: current.id,
        changes: {
          status: finalStatus,
          total: current.total,
          processed: current.processed + batch.length,
          delivered: current.delivered + delivered,
          failed: current.failed + failed,
        },
      });
    }
    return { count: batch.length, finished };
  }

  private audienceOf(job: MailingJob): SystemMessageAudienceDto {
    const audience = new SystemMessageAudienceDto();
    audience.kind = job.audienceKind as SystemMessageAudienceDto['kind'];
    audience.roleId = job.audienceRoleId ?? undefined;
    audience.userIds = (job.audienceUserIds as string[] | null) ?? undefined;
    return audience;
  }

  private view(job: MailingJob): MailingView {
    return {
      id: job.id,
      status: job.status,
      title: job.title,
      audience: job.audienceKind,
      total: job.total,
      processed: job.processed,
      delivered: job.delivered,
      skipped: job.skipped,
      failed: job.failed,
      lastError: job.lastError,
      createdById: job.createdById,
      cancelledById: job.cancelledById,
      cancelledAt: job.cancelledAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      createdAt: job.createdAt,
    };
  }
}
