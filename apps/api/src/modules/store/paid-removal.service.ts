import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MinecraftPunishmentKind,
  MinecraftPunishmentStatus,
  OrderStatus,
  Prisma,
  ProductType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  PAID_REMOVAL_SETTING,
  PaidRemovalRules,
  parsePaidRemovalRules,
  reasonAllowed,
  removalKindOf,
  rulesAllowKind,
} from './paid-removal-rules';
import {
  checkoutBadRequest,
  paidRemovalUnavailable,
  StoreCheckoutError,
} from './store-errors';

export const PAID_REMOVAL_AUDIT_ACTION = 'punishment.paid_removal';
const PAID_REMOVAL_TYPES = [ProductType.UNBAN, ProductType.UNMUTE];

/// Снятие в момент выдачи неприменимо (наказание уже снято, истекло, изменилось
/// или не подпадает под правила). Исполнитель переводит задание в
/// NEEDS_ATTENTION с причиной `not_applicable`; команда не отправляется.
export class PaidRemovalNotApplicableError extends Error {
  constructor() {
    super('paid_removal_not_applicable');
  }
}

export interface PaidRemovalLine {
  productId: string | null;
  quantity: number;
}

export interface PaidRemovalRecordResult {
  /// true — запись создана этим вызовом; false — уже была (повтор, снимать повторно нельзя).
  created: boolean;
  punishmentId: string | null;
  kind: MinecraftPunishmentKind;
  orderNumber: string;
}

/// Платное снятие бана и мута (0.12b, ADR-0186 пп. 6-9, ADR-0190).
/// Исключение к ADR-0173 действует ТОЛЬКО через этот сервис: единственная
/// точка записи снятия «система от имени владельца», HTTP-вызова нет.
/// Fail closed: нет настройки, пустой список причин, выключен флаг, нет
/// системного актора — товар не оформляется, снятие не записывается.
@Injectable()
export class PaidRemovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /// Env `UNPUNISH_ENABLED`: только явный true включает (в production по
  /// умолчанию false, Joi).
  isEnabledByEnv(): boolean {
    const raw = this.config.get<boolean | string | undefined>(
      'UNPUNISH_ENABLED',
    );
    return raw === true || raw === 'true';
  }

  async loadRules(): Promise<PaidRemovalRules> {
    const row = await this.prisma.siteSetting.findUnique({
      where: { key: PAID_REMOVAL_SETTING },
      select: { value: true },
    });
    return parsePaidRemovalRules(row?.value);
  }

  private async activePunishment(
    nick: string,
    kind: MinecraftPunishmentKind,
    rules: PaidRemovalRules,
    now: Date,
  ) {
    const p = await this.prisma.minecraftPunishment.findFirst({
      where: {
        kind,
        status: MinecraftPunishmentStatus.ACTIVE,
        ipBan: false,
        subjectName: { equals: nick, mode: 'insensitive' },
      },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        reason: true,
        startedAt: true,
        executorUuid: true,
        executorName: true,
        executorIsConsole: true,
      },
    });
    if (!p) return null;
    const unknownIssuer =
      !p.executorUuid && !p.executorName && !p.executorIsConsole;
    if (unknownIssuer) return null;
    if (!reasonAllowed(rules, p.reason)) return null;
    const ageMs = now.getTime() - p.startedAt.getTime();
    if (ageMs < rules.minAgeHours * 3_600_000) return null;
    return p;
  }

  private async overLimit(
    nick: string,
    rules: PaidRemovalRules,
    now: Date,
  ): Promise<boolean> {
    if (rules.maxPerNick === null) return false;
    const since = new Date(now.getTime() - rules.periodDays * 86_400_000);
    const count = await this.prisma.paidRemovalRecord.count({
      where: {
        subjectName: { equals: nick, mode: 'insensitive' },
        createdAt: { gte: since },
      },
    });
    return count >= rules.maxPerNick;
  }

  /// Проверка при оформлении (до оплаты). Строки без товаров снятия проходят
  /// без обращения к правилам. Порядок: выключатель/правила (не зависят от
  /// ника, `paid_removal_unavailable`) -> по одной штуке -> проверки по нику
  /// (нет подходящего наказания, лимит — единый `nick_unavailable` без
  /// различения причин, ADR-0186 п. 8).
  async assertPurchasable(
    lines: PaidRemovalLine[],
    nick: string,
    now: Date = new Date(),
  ): Promise<void> {
    const ids = [
      ...new Set(
        lines.map((l) => l.productId).filter((id): id is string => !!id),
      ),
    ];
    if (ids.length === 0) return;
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, type: { in: PAID_REMOVAL_TYPES } },
      select: { id: true, type: true },
    });
    if (products.length === 0) return;
    if (!this.isEnabledByEnv()) throw paidRemovalUnavailable();
    const rules = await this.loadRules();
    const kinds = new Set<MinecraftPunishmentKind>();
    for (const p of products) {
      const kind = removalKindOf(p.type);
      if (!kind || !rulesAllowKind(rules, kind)) throw paidRemovalUnavailable();
      kinds.add(kind);
    }
    const removalIds = new Set(products.map((p) => p.id));
    for (const line of lines) {
      if (
        line.productId &&
        removalIds.has(line.productId) &&
        line.quantity !== 1
      ) {
        throw checkoutBadRequest(
          StoreCheckoutError.PAID_REMOVAL_SINGLE_ONLY,
          'Снятие наказания можно купить только в количестве 1',
        );
      }
    }
    for (const kind of kinds) {
      const punishment = await this.activePunishment(nick, kind, rules, now);
      if (!punishment || (await this.overLimit(nick, rules, now))) {
        throw checkoutBadRequest(
          StoreCheckoutError.NICK_UNAVAILABLE,
          'Этот ник недоступен для покупки',
        );
      }
    }
  }

  /// Запись платного снятия ПЕРЕД отправкой команды (ADR-0186 Р9): журнал
  /// `paid_removal_records` + аудит `punishment.paid_removal` в одной
  /// транзакции; нет записи аудита (strict) — нет снятия. Идемпотентно по
  /// `orderItemId`: повтор (повторный вебхук, повтор выдачи) возвращает
  /// `created = false`, и вызывающий НЕ отправляет команду повторно.
  /// Запись всегда содержит номер заказа. Вызывается исполнителем выдачи
  /// (0.11/0.13) для позиции типа UNBAN/UNMUTE заказа COMPLETED.
  async recordRemoval(
    orderItemId: string,
    now: Date = new Date(),
  ): Promise<PaidRemovalRecordResult> {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
      select: {
        id: true,
        quantity: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            guestMinecraftNick: true,
          },
        },
        product: { select: { type: true } },
      },
    });
    const kind = item?.product ? removalKindOf(item.product.type) : null;
    if (!item || !kind) throw new PaidRemovalNotApplicableError();
    const { order } = item;
    if (
      order.status !== OrderStatus.COMPLETED ||
      item.quantity !== 1 ||
      !order.guestMinecraftNick ||
      !order.orderNumber
    ) {
      throw new PaidRemovalNotApplicableError();
    }
    const nick = order.guestMinecraftNick;

    const existing = await this.prisma.paidRemovalRecord.findUnique({
      where: { orderItemId },
      select: { punishmentId: true },
    });
    if (existing) {
      return {
        created: false,
        punishmentId: existing.punishmentId,
        kind,
        orderNumber: order.orderNumber,
      };
    }

    if (!this.isEnabledByEnv()) throw paidRemovalUnavailable();
    const rules = await this.loadRules();
    if (!rulesAllowKind(rules, kind)) throw paidRemovalUnavailable();
    // Системный актор обязателен: без него снятие не записывается (fail closed).
    const actor = rules.actorUserId
      ? await this.prisma.user.findFirst({
          where: { id: rules.actorUserId, accountType: 'SYSTEM' },
          select: { id: true },
        })
      : null;
    if (!actor) {
      throw new ConflictException({
        code: 'paid_removal_actor_missing',
        message: 'Не настроена системная учётная запись для платного снятия',
      });
    }
    const punishment = await this.activePunishment(nick, kind, rules, now);
    if (!punishment) throw new PaidRemovalNotApplicableError();

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.paidRemovalRecord.create({
          data: {
            orderItemId,
            orderId: order.id,
            orderNumber: order.orderNumber,
            kind,
            subjectName: nick,
            punishmentId: punishment.id,
            ruleVersion: rules.version,
          },
        });
        await this.audit.log({
          actorId: actor.id,
          action: PAID_REMOVAL_AUDIT_ACTION,
          targetType: 'minecraft_punishment',
          targetId: punishment.id,
          severity: 'warning',
          strict: true,
          tx,
          changes: {
            summary: `Снято системой от имени владельца, заказ № ${order.orderNumber}`,
            orderNumber: order.orderNumber,
            orderItemId,
            kind,
            ruleVersion: rules.version,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Гонка двух выдач: победитель записал, мы — повтор.
        return {
          created: false,
          punishmentId: punishment.id,
          kind,
          orderNumber: order.orderNumber,
        };
      }
      throw error;
    }
    return {
      created: true,
      punishmentId: punishment.id,
      kind,
      orderNumber: order.orderNumber,
    };
  }
}
