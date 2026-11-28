import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeliveryTaskStatus,
  OrderStatus,
  Prisma,
  ProductType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListDeliveryTasksQueryDto } from './dto/list-delivery-tasks-query.dto';
import {
  DeliveryExecutor,
  DeliveryResult,
  DeliveryTaskSnapshot,
} from './delivery-executor.interface';
import {
  renderCommand,
  CommandTemplateError,
  EXTRA_ROOTS_SETTING,
  normalizeRoots,
} from './command-template';

/// Битая настройка не должна ронять выдачу: при ошибке расширения нет.
function safeRoots(raw: string | undefined): string[] {
  try {
    return normalizeRoots(raw ?? '');
  } catch {
    return [];
  }
}
import { deliverableNickOrNull } from './delivery-nick';
import { sanitizeDeliveryError } from './delivery-status';
import {
  DELIVERY_BACKOFF_MS,
  DELIVERY_BATCH_SIZE,
  DELIVERY_BRIDGE_ENABLED_SETTING,
  DELIVERY_BRIDGE_SERVER_SETTING,
  DELIVERY_COMMAND_ENABLED_SETTING,
  DELIVERY_DEFAULT_MAX_ATTEMPTS,
  DELIVERY_ENABLED_SETTING,
  DELIVERY_ENV_FLAG,
  DELIVERY_EXECUTOR_TIMEOUT_MS,
  DELIVERY_LEASE_MARGIN_MS,
  DELIVERY_MAX_ATTEMPTS_SETTING,
  DELIVERY_RECONCILE_BATCH_SIZE,
  DELIVERY_RECONCILE_ENV_FLAG,
  DELIVERY_RECONCILE_GRACE_MS,
  DELIVERY_RECONCILE_LOOKBACK_MS,
  DELIVERY_SETTINGS_CACHE_MS,
  DONE_STATUSES,
  EXECUTOR_BRIDGE,
  EXECUTOR_COMMAND,
  EXECUTOR_MANUAL,
  EXECUTOR_SITE,
  EXECUTOR_WALLET,
  MANUAL_DONE_FROM,
  REFUND_BLOCKING_STATUSES,
  BRIDGE_UNSETTLED,
  RETRY_FROM,
} from './delivery.constants';
import { BridgeExecutor } from './executors/bridge.executor';
import { CommandExecutor } from './executors/command.executor';
import { ManualExecutor } from './executors/manual.executor';
import { SiteExecutor } from './executors/site.executor';
import { WalletExecutor } from './executors/wallet.executor';
import { isValidSlug } from '../bridge/bridge.constants';
import { walletLedgerEnabled } from '../wallet/wallet-config';

export interface DeliverySettings {
  enabled: boolean;
  commandEnabled: boolean;
  /// Исполнитель `bridge` включён настройкой (0.13) и задан сервер.
  bridgeEnabled: boolean;
  /// Slug целевого сервера Bridge (валидный формат) или null.
  bridgeServerSlug: string | null;
  maxAttempts: number;
  /// Расширение белого списка корней команд (ADR-0189).
  extraCommandRoots: string[];
}

interface ClaimedTask {
  id: string;
  orderItemId: string;
  step: number;
  executor: string;
  attempts: number;
  leaseToken: string;
  nick: string | null;
  recipientUserId: string | null;
  renderedCommand: string | null;
}

/// Слой доставки купленного (подэтап 0.7, ADR-0184). Заказ не знает, чем
/// выдаётся товар: DeliveryService создаёт задания в транзакции вебхука и
/// обрабатывает их заменяемыми исполнителями.
///
/// Жёсткие правила: сервис и исполнители НИКОГДА не читают
/// `Product.gameCommands` (Р1); единственный источник команды в будущем —
/// шаблон, замороженный в задании (`renderedCommand`, 0.11); аренда с токеном
/// (Р6); «не более одного раза» для неидемпотентных исполнителей (п. 6).
@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);
  private readonly executors = new Map<string, DeliveryExecutor>();
  private settingsCache: { at: number; value: DeliverySettings } | null = null;

  /// Тайминги; аренда строго длиннее тайм-аута (Р6). Изменяются тестами.
  readonly timing = {
    executorTimeoutMs: DELIVERY_EXECUTOR_TIMEOUT_MS,
    leaseMarginMs: DELIVERY_LEASE_MARGIN_MS,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    manual: ManualExecutor,
    site: SiteExecutor,
    command: CommandExecutor,
    wallet?: WalletExecutor,
    bridge?: BridgeExecutor,
  ) {
    for (const executor of [manual, site, command, wallet, bridge]) {
      if (executor) this.executors.set(executor.kind, executor);
    }
  }

  // ---------------------------------------------------------------- флаг

  /// Доставка идёт, только если разрешают оба: env не `false` (жёсткий запрет)
  /// и настройка сайта `store.delivery.enabled` = true (по умолчанию false).
  /// Настройка читается с кэшем не более 30 секунд (Р10).
  async isEnabled(now: number = Date.now()): Promise<boolean> {
    if (this.envHardDisabled()) return false;
    return (await this.settings(now)).enabled;
  }

  /// Env `STORE_DELIVERY_ENABLED` явно false: аварийный запрет (Q80).
  envHardDisabled(): boolean {
    const raw = this.config.get<boolean | string | undefined>(
      DELIVERY_ENV_FLAG,
    );
    return raw === false || raw === 'false';
  }

  resetSettingsCache(): void {
    this.settingsCache = null;
  }

  async settings(now: number = Date.now()): Promise<DeliverySettings> {
    const cached = this.settingsCache;
    if (cached && now - cached.at < DELIVERY_SETTINGS_CACHE_MS) {
      return cached.value;
    }
    const rows = await this.prisma.siteSetting.findMany({
      where: {
        key: {
          in: [
            DELIVERY_ENABLED_SETTING,
            DELIVERY_COMMAND_ENABLED_SETTING,
            DELIVERY_BRIDGE_ENABLED_SETTING,
            DELIVERY_BRIDGE_SERVER_SETTING,
            DELIVERY_MAX_ATTEMPTS_SETTING,
            EXTRA_ROOTS_SETTING,
          ],
        },
      },
    });
    const get = (key: string) => rows.find((r) => r.key === key)?.value;
    const parsedMax = Number.parseInt(
      get(DELIVERY_MAX_ATTEMPTS_SETTING) ?? '',
      10,
    );
    const rawSlug = get(DELIVERY_BRIDGE_SERVER_SETTING)?.trim();
    const bridgeSlug = rawSlug && isValidSlug(rawSlug) ? rawSlug : null;
    const value: DeliverySettings = {
      enabled: get(DELIVERY_ENABLED_SETTING) === 'true',
      commandEnabled: get(DELIVERY_COMMAND_ENABLED_SETTING) === 'true',
      bridgeServerSlug: bridgeSlug,
      // Нужны и включение, и корректный slug: иначе fail closed на `command`.
      bridgeEnabled:
        get(DELIVERY_BRIDGE_ENABLED_SETTING) === 'true' && bridgeSlug !== null,
      maxAttempts:
        Number.isInteger(parsedMax) && parsedMax >= 1 && parsedMax <= 20
          ? parsedMax
          : DELIVERY_DEFAULT_MAX_ATTEMPTS,
      extraCommandRoots: safeRoots(get(EXTRA_ROOTS_SETTING)),
    };
    this.settingsCache = { at: now, value };
    return value;
  }

  // ------------------------------------------------- создание заданий

  /// Исполнитель позиции. В 0.7 шаблонов команд нет, поэтому игровые товары
  /// (PRIVILEGE, KEY, UNBAN, UNMUTE, CURRENCY, BATTLE_PASS) и наборы идут на
  /// `manual`; сайтовое украшение (`Product.decorationId`) — на `site`.
  /// `Product.gameCommands` не читается.
  ///
  /// 0.15: товар CURRENCY с получателем-пользователем идёт на `wallet`
  /// (зачисление рубинов), только если включён WALLET_LEDGER_ENABLED.
  selectExecutor(
    decorationId: string | null | undefined,
    productType?: ProductType | null,
    hasRecipientUser = false,
  ): string {
    if (decorationId) return EXECUTOR_SITE;
    if (
      productType === ProductType.CURRENCY &&
      hasRecipientUser &&
      walletLedgerEnabled(this.config) &&
      this.executors.has(EXECUTOR_WALLET)
    ) {
      return EXECUTOR_WALLET;
    }
    return EXECUTOR_MANUAL;
  }

  /// Создаёт задания заказа (минимум: чтение заказа и ников получателей
  /// подарков, одна вставка, без внешних вызовов). Вызывается отдельным шагом
  /// ПОСЛЕ коммита перехода в COMPLETED (`createTasksAfterPayment`) и из
  /// фоновой сверки; в транзакцию вебхука больше не входит. Идемпотентно по
  /// UNIQUE (orderItemId, step): повторный вызов дублей не создаёт.
  /// Подарок выдаётся получателю (`giftToUserId`), не покупателю. Флаг
  /// доставки не влияет на создание: он управляет только обработкой.
  ///
  /// Гонка с возвратом (ревью 0.7): заказ блокируется `SELECT ... FOR UPDATE`
  /// (тот же порядок блокировок, что у `refund`: заказ, затем задания), статус
  /// читается под блокировкой, и задания создаются ТОЛЬКО для COMPLETED.
  /// Иначе (возврат успел между выборкой кандидата и вставкой) — пропуск с
  /// логом, 0 заданий. Вызывать только внутри транзакции.
  async createTasksForOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<number> {
    const locked = await tx.$queryRaw<{ status: OrderStatus }[]>`
      SELECT status FROM orders WHERE id = ${orderId} FOR UPDATE`;
    const lockedStatus = locked[0]?.status;
    if (lockedStatus !== OrderStatus.COMPLETED) {
      this.logger.warn(
        `Создание заданий выдачи пропущено: order=${orderId} статус ${lockedStatus ?? 'не найден'} (нужен COMPLETED)`,
      );
      return 0;
    }
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        guestMinecraftNick: true,
        items: {
          select: {
            id: true,
            giftToUserId: true,
            productId: true,
            variantId: true,
            variant: { select: { duration: true } },
            product: { select: { decorationId: true, type: true } },
          },
        },
      },
    });
    if (!order || order.items.length === 0) return 0;

    // 0.11: шаблоны команд читаются, только если включены и доставка, и
    // исполнитель «команда»; иначе поведение 0.7 (manual) не меняется.
    const templates = await this.loadTemplates(tx, order.items);
    const extraRoots = templates
      ? (await this.settings()).extraCommandRoots
      : [];
    // 0.13: при включённом bridge (настройка + регистрация исполнителя) задания
    // с шаблоном идут на него; иначе, как раньше, на `command` (если включён).
    const bridgeWanted = Boolean(
      templates &&
      (await this.settings()).bridgeEnabled &&
      this.executors.has(EXECUTOR_BRIDGE) &&
      this.executors.get(EXECUTOR_BRIDGE)?.operational?.() !== false,
    );
    const commandWanted = Boolean(
      templates && ((await this.settings()).commandEnabled || bridgeWanted),
    );

    const giftIds = [
      ...new Set(
        order.items.flatMap((i) => (i.giftToUserId ? [i.giftToUserId] : [])),
      ),
    ];
    const giftNicks = new Map<string, string>();
    if (giftIds.length > 0) {
      const accounts = await tx.minecraftAccount.findMany({
        where: { userId: { in: giftIds } },
        select: { userId: true, name: true },
      });
      for (const a of accounts) giftNicks.set(a.userId, a.name);
    }

    const data = order.items.map((item) => {
      const isGift = Boolean(item.giftToUserId);
      const rawNick = isGift
        ? (giftNicks.get(item.giftToUserId!) ?? null)
        : order.guestMinecraftNick;
      const recipientUserId = isGift ? item.giftToUserId : order.userId;
      let executorKind = this.selectExecutor(
        item.product?.decorationId,
        item.product?.type,
        Boolean(recipientUserId),
      );
      let renderedCommand: string | null = null;
      let templateVersion: number | null = null;
      if (executorKind === EXECUTOR_MANUAL && templates) {
        const tpl = this.pickTemplate(templates, item);
        const nick = deliverableNickOrNull(rawNick);
        if (tpl && nick && commandWanted) {
          try {
            // Подстановка только через общий валидатор; сбой -> manual.
            renderedCommand = renderCommand(
              tpl.template,
              {
                username: nick,
                duration: item.variant?.duration,
              },
              extraRoots,
            );
            templateVersion = tpl.version;
            executorKind = bridgeWanted ? EXECUTOR_BRIDGE : EXECUTOR_COMMAND;
          } catch (error) {
            if (!(error instanceof CommandTemplateError)) throw error;
            this.logger.warn(
              `Шаблон команды не применён: item=${item.id} (${error.code}); выдача вручную`,
            );
          }
        }
      }
      const executor = this.executors.get(executorKind);
      return {
        orderItemId: item.id,
        step: 1,
        executor: executorKind,
        status: executor?.automatic
          ? DeliveryTaskStatus.PENDING
          : DeliveryTaskStatus.AWAITING_MANUAL,
        // Р9: ник проверяется и при создании задания; негодный не сохраняется.
        nick: deliverableNickOrNull(rawNick),
        recipientUserId,
        // Рубины при выключенном кошельке: ручная выдача с причиной (0.15).
        ...(item.product?.type === ProductType.CURRENCY &&
        executorKind === EXECUTOR_MANUAL &&
        !walletLedgerEnabled(this.config)
          ? { lastError: 'wallet_disabled' }
          : {}),
        // Без шаблона поля не задаются: поведение 0.7 (null в БД) не меняется.
        ...(renderedCommand ? { renderedCommand, templateVersion } : {}),
      };
    });
    const created = await tx.deliveryTask.createMany({
      data,
      skipDuplicates: true,
    });
    return created.count;
  }

  /// Шаблоны команд позиций заказа или null, если команды выключены.
  private async loadTemplates(
    tx: Prisma.TransactionClient,
    items: { productId: string | null }[],
  ): Promise<
    | {
        productId: string;
        variantId: string | null;
        template: string;
        version: number;
      }[]
    | null
  > {
    const productIds = [
      ...new Set(items.flatMap((i) => (i.productId ? [i.productId] : []))),
    ];
    if (productIds.length === 0) return null;
    if (!(await this.isEnabled())) return null;
    const cfg = await this.settings();
    if (!cfg.commandEnabled && !cfg.bridgeEnabled) return null;
    return tx.deliveryCommandTemplate.findMany({
      where: { productId: { in: productIds } },
      select: {
        productId: true,
        variantId: true,
        template: true,
        version: true,
      },
    });
  }

  /// Шаблон варианта приоритетнее шаблона товара.
  private pickTemplate(
    templates: {
      productId: string;
      variantId: string | null;
      template: string;
      version: number;
    }[],
    item: { productId: string | null; variantId: string | null },
  ) {
    if (!item.productId) return null;
    return (
      templates.find(
        (t) =>
          t.productId === item.productId &&
          t.variantId === item.variantId &&
          t.variantId,
      ) ??
      templates.find((t) => t.productId === item.productId && !t.variantId) ??
      null
    );
  }

  /// Шаг ПОСЛЕ коммита вебхука оплаты: заказ уже COMPLETED и деньги
  /// зафиксированы. Любая ошибка создания заданий только логируется и НЕ
  /// пробрасывается: оплата не теряется, недостающие задания досоздаёт
  /// фоновая сверка (`reconcileMissingTasks`). Без внешних вызовов, один
  /// путь с общей идемпотентностью UNIQUE (orderItemId, step).
  /// Возвращает true, если шаг прошёл без ошибки.
  async createTasksAfterPayment(orderId: string): Promise<boolean> {
    try {
      await this.prisma.$transaction(
        (tx) => this.createTasksForOrder(tx, orderId),
        { maxWait: 10_000, timeout: 10_000 },
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Сбой создания заданий выдачи после оплаты: order=${orderId} (${sanitizeDeliveryError(error)}); задания досоздаст сверка`,
      );
      return false;
    }
  }

  /// Фоновая сверка: находит COMPLETED-заказы с позициями без заданий и
  /// создаёт недостающие тем же `createTasksForOrder`. Каждый заказ в своей
  /// короткой транзакции под `pg_try_advisory_xact_lock(order)`: параллельные
  /// инстансы не дублируют работу, а сбой одного заказа не абортит остальные
  /// (в PostgreSQL ошибка рвёт всю транзакцию). Системное досоздание не пишет
  /// в аудит (нет актора; действие восстанавливающее и идемпотентное), только
  /// info-лог с числом. Возвращает число созданных заданий.
  async reconcileMissingTasks(
    options: {
      now?: Date;
      limit?: number;
      graceMs?: number;
      lookbackMs?: number;
    } = {},
  ): Promise<number> {
    if (this.reconcileHardDisabled()) return 0;
    const now = options.now ?? new Date();
    const limit = options.limit ?? DELIVERY_RECONCILE_BATCH_SIZE;
    const paidBefore = new Date(
      now.getTime() - (options.graceMs ?? DELIVERY_RECONCILE_GRACE_MS),
    );
    const paidAfter = new Date(
      now.getTime() - (options.lookbackMs ?? DELIVERY_RECONCILE_LOOKBACK_MS),
    );
    const candidates = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.COMPLETED,
        paidAt: { gte: paidAfter, lte: paidBefore },
        items: { some: { deliveryTasks: { none: {} } } },
      },
      select: { id: true },
      orderBy: { paidAt: 'asc' },
      take: limit,
    });
    let created = 0;
    for (const { id } of candidates) {
      try {
        created += await this.prisma.$transaction(async (tx) => {
          const rows = await tx.$queryRaw<{ locked: boolean }[]>(
            Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtext(${`delivery-reconcile:${id}`})) AS locked`,
          );
          if (!rows[0]?.locked) return 0;
          return this.createTasksForOrder(tx, id);
        });
      } catch (error) {
        this.logger.warn(
          `Сверка заданий выдачи: order=${id} не обработан (${sanitizeDeliveryError(error)})`,
        );
      }
    }
    if (created > 0) {
      this.logger.log(
        `Сверка заданий выдачи: досоздано ${created} (заказов в пачке ${candidates.length})`,
      );
    }
    return created;
  }

  /// Env `DELIVERY_RECONCILE_ENABLED` явно false: сверка выключена.
  reconcileHardDisabled(): boolean {
    const raw = this.config.get<boolean | string | undefined>(
      DELIVERY_RECONCILE_ENV_FLAG,
    );
    return raw === false || raw === 'false';
  }

  // --------------------------------------------------- воркер и захват

  /// Один проход воркера: при включённой доставке возвращает в работу
  /// просроченные аренды и обрабатывает до `limit` заданий по одному.
  async processBatch(
    limit: number = DELIVERY_BATCH_SIZE,
    now: Date = new Date(),
  ): Promise<number> {
    if (!(await this.isEnabled(now.getTime()))) return 0;
    await this.recoverExpiredLeases(now);
    await this.cancelTasksOfClosedOrders();
    let processed = 0;
    for (let i = 0; i < limit; i += 1) {
      const task = await this.claimNext(new Date());
      if (!task) break;
      await this.runClaimed(task);
      processed += 1;
    }
    return processed;
  }

  /// Воркер не выдаёт по закрытому заказу: `claimNext` берёт только задания
  /// COMPLETED-заказов, а невыданные открытые задания REFUNDED/CANCELLED/FAILED
  /// заказов переводятся в CANCELLED (`lastError = order_not_completed`).
  /// Выбор CANCELLED, а не NEEDS_ATTENTION: задание не выполнялось, а
  /// NEEDS_ATTENTION блокирует возврат и показывается покупателю как сбой;
  /// CANCELLED не теряет данных (строка и причина остаются) и совпадает с
  /// тем, что делает возврат. Задания PENDING-заказа не трогаются (просто не
  /// берутся). Миграции не нужны (значение enum уже есть).
  async cancelTasksOfClosedOrders(): Promise<number> {
    const res = await this.prisma.deliveryTask.updateMany({
      where: {
        status: {
          in: [
            DeliveryTaskStatus.PENDING,
            DeliveryTaskStatus.RETRY_WAIT,
            DeliveryTaskStatus.AWAITING_MANUAL,
          ],
        },
        orderItem: {
          order: {
            status: {
              in: [
                OrderStatus.REFUNDED,
                OrderStatus.CANCELLED,
                OrderStatus.FAILED,
              ],
            },
          },
        },
      },
      data: {
        status: DeliveryTaskStatus.CANCELLED,
        lastError: 'order_not_completed',
        leaseToken: null,
        leaseUntil: null,
        nextAttemptAt: null,
      },
    });
    if (res.count > 0) {
      this.logger.warn(
        `Выдача: отменено ${res.count} заданий закрытых заказов (order_not_completed)`,
      );
    }
    return res.count;
  }

  leaseMs(): number {
    return this.timing.executorTimeoutMs + this.timing.leaseMarginMs;
  }

  /// Захват одного задания: `FOR UPDATE SKIP LOCKED` в подзапросе и аренда с
  /// токеном в одном атомарном UPDATE (Р6). Шаг N+1 не стартует, пока шаг N не
  /// в DELIVERED/MANUAL_DONE (Р4). Берутся только автоматические исполнители,
  /// включённые настройкой (`command` по умолчанию выключен).
  async claimNext(now: Date = new Date()): Promise<ClaimedTask | null> {
    const settings = await this.settings(now.getTime());
    const kinds = [...this.executors.values()]
      .filter(
        (e) =>
          e.automatic &&
          (e.kind !== EXECUTOR_COMMAND || settings.commandEnabled) &&
          (e.kind !== EXECUTOR_BRIDGE ||
            (settings.bridgeEnabled && (e.operational?.() ?? true))),
      )
      .map((e) => e.kind);
    if (kinds.length === 0) return null;
    const leaseUntil = new Date(now.getTime() + this.leaseMs());
    const rows = await this.prisma.$queryRaw<ClaimedTask[]>(Prisma.sql`
      UPDATE delivery_tasks AS t
      SET status = 'IN_PROGRESS'::"DeliveryTaskStatus",
          attempts = t.attempts + 1,
          "leaseToken" = gen_random_uuid()::text,
          "leaseUntil" = ${leaseUntil},
          "nextAttemptAt" = NULL,
          "updatedAt" = ${now}
      WHERE t.id = (
        SELECT c.id FROM delivery_tasks c
        WHERE c.executor IN (${Prisma.join(kinds)})
          AND (
            c.status = 'PENDING'::"DeliveryTaskStatus"
            OR (c.status = 'RETRY_WAIT'::"DeliveryTaskStatus" AND c."nextAttemptAt" <= ${now})
          )
          AND EXISTS (
            SELECT 1 FROM order_items oi
            JOIN orders o ON o.id = oi."orderId"
            WHERE oi.id = c."orderItemId"
              AND o.status = 'COMPLETED'::"OrderStatus"
          )
          AND NOT EXISTS (
            SELECT 1 FROM delivery_tasks p
            WHERE p."orderItemId" = c."orderItemId"
              AND p.step < c.step
              AND p.status NOT IN ('DELIVERED'::"DeliveryTaskStatus", 'MANUAL_DONE'::"DeliveryTaskStatus")
          )
        ORDER BY c."createdAt", c.id
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING t.id, t."orderItemId", t.step, t.executor, t.attempts,
                t."leaseToken", t.nick, t."recipientUserId", t."renderedCommand"`);
    return rows[0] ?? null;
  }

  /// Просроченная аренда: идемпотентный исполнитель — обратно в PENDING,
  /// остальные — NEEDS_ATTENTION (команда могла уйти, ADR-0184 п. 5).
  async recoverExpiredLeases(now: Date = new Date()): Promise<number> {
    const idempotent = [...this.executors.values()]
      .filter((e) => e.idempotent)
      .map((e) => e.kind);
    const back = await this.prisma.deliveryTask.updateMany({
      where: {
        status: DeliveryTaskStatus.IN_PROGRESS,
        leaseUntil: { lt: now },
        executor: { in: idempotent },
      },
      data: {
        status: DeliveryTaskStatus.PENDING,
        leaseUntil: null,
        lastError: 'lease_expired',
      },
    });
    const attention = await this.prisma.deliveryTask.updateMany({
      where: {
        status: DeliveryTaskStatus.IN_PROGRESS,
        leaseUntil: { lt: now },
        executor: { notIn: idempotent },
      },
      data: {
        status: DeliveryTaskStatus.NEEDS_ATTENTION,
        leaseUntil: null,
        lastError: 'lease_expired',
      },
    });
    return back.count + attention.count;
  }

  /// Исполнение захваченного задания с тайм-аутом. Исключение или тайм-аут
  /// неидемпотентного исполнителя — `unknown` (NEEDS_ATTENTION, без автоповтора);
  /// идемпотентного — `retry`. Поздний результат после тайм-аута принимается
  /// только по токену последней попытки (Р6).
  async runClaimed(task: ClaimedTask): Promise<void> {
    const executor = this.executors.get(task.executor);
    if (!executor) {
      await this.applyResult(task.id, task.leaseToken, {
        kind: 'failed',
        reason: 'unknown_executor',
      });
      return;
    }
    const snapshot = await this.buildSnapshot(task);
    if (!snapshot) {
      await this.applyResult(task.id, task.leaseToken, {
        kind: 'failed',
        reason: 'item_missing',
      });
      return;
    }

    type Outcome =
      { result: DeliveryResult } | { error: unknown } | { timeout: true };
    const execution = Promise.resolve()
      .then(() => executor.execute(snapshot))
      .then(
        (result): Outcome => ({ result }),
        (error: unknown): Outcome => ({ error }),
      );
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<Outcome>((resolve) => {
      timer = setTimeout(
        () => resolve({ timeout: true }),
        this.timing.executorTimeoutMs,
      );
    });
    let outcome: Outcome;
    try {
      outcome = await Promise.race([execution, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }

    if ('result' in outcome) {
      await this.applyResult(task.id, task.leaseToken, outcome.result);
      return;
    }
    if ('error' in outcome) {
      await this.applyResult(
        task.id,
        task.leaseToken,
        this.failureResult(executor, sanitizeDeliveryError(outcome.error)),
      );
      return;
    }
    await this.applyResult(
      task.id,
      task.leaseToken,
      this.failureResult(executor, 'timeout'),
    );
    // Исполнитель ещё работает: его поздний результат может прийти позже.
    void execution.then(async (late) => {
      if ('result' in late) {
        try {
          await this.applyResult(task.id, task.leaseToken, late.result);
        } catch (error) {
          this.logger.warn(
            `Поздний результат задания ${task.id} не применён: ${sanitizeDeliveryError(error)}`,
          );
        }
      }
    });
  }

  private failureResult(
    executor: DeliveryExecutor,
    reason: string,
  ): DeliveryResult {
    return executor.idempotent
      ? { kind: 'retry', reason }
      : { kind: 'unknown', reason };
  }

  private async buildSnapshot(
    task: ClaimedTask,
  ): Promise<DeliveryTaskSnapshot | null> {
    // Поля товара выбираются поимённо: `gameCommands` не читается (Р1).
    const item = await this.prisma.orderItem.findUnique({
      where: { id: task.orderItemId },
      select: {
        orderId: true,
        quantity: true,
        product: { select: { decorationId: true } },
      },
    });
    if (!item) return null;
    const settings =
      task.executor === EXECUTOR_BRIDGE ? await this.settings() : null;
    return {
      taskId: task.id,
      orderItemId: task.orderItemId,
      orderId: item.orderId,
      step: task.step,
      executor: task.executor,
      attempt: task.attempts,
      idempotencyKey: `${task.orderItemId}:${task.step}`,
      nick: deliverableNickOrNull(task.nick),
      recipientUserId: task.recipientUserId,
      quantity: item.quantity,
      decorationId: item.product?.decorationId ?? null,
      renderedCommand: task.renderedCommand,
      bridge: settings?.bridgeServerSlug
        ? {
            serverSlug: settings.bridgeServerSlug,
            extraCommandRoots: settings.extraCommandRoots,
          }
        : null,
    };
  }

  /// Принять результат исполнителя. Принимается, только если токен аренды
  /// совпадает с текущим (Р6): для IN_PROGRESS — любой результат, для
  /// NEEDS_ATTENTION — только поздние `delivered`/`failed`. Остальное
  /// игнорируется (true/false: принят ли результат).
  async applyResult(
    taskId: string,
    leaseToken: string,
    result: DeliveryResult,
    now: Date = new Date(),
  ): Promise<boolean> {
    const settings = await this.settings(now.getTime());
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.deliveryTask.findUnique({
        where: { id: taskId },
        select: {
          status: true,
          leaseToken: true,
          attempts: true,
          orderItemId: true,
        },
      });
      if (!current || current.leaseToken !== leaseToken) {
        this.logger.warn(
          `Результат задания ${taskId} отклонён: токен не совпал`,
        );
        return false;
      }
      const late = current.status === DeliveryTaskStatus.NEEDS_ATTENTION;
      if (current.status !== DeliveryTaskStatus.IN_PROGRESS && !late) {
        this.logger.warn(
          `Результат задания ${taskId} проигнорирован: статус ${current.status}`,
        );
        return false;
      }
      if (late && result.kind !== 'delivered' && result.kind !== 'failed') {
        return false;
      }

      let data: Prisma.DeliveryTaskUncheckedUpdateManyInput;
      switch (result.kind) {
        case 'delivered':
          data = {
            status: DeliveryTaskStatus.DELIVERED,
            deliveredAt: now,
            lastError: null,
          };
          break;
        case 'retry':
          if (current.attempts >= settings.maxAttempts) {
            data = {
              status: DeliveryTaskStatus.FAILED,
              lastError: sanitizeDeliveryError(result.reason),
            };
          } else {
            const backoff =
              DELIVERY_BACKOFF_MS[
                Math.min(current.attempts, DELIVERY_BACKOFF_MS.length) - 1
              ] ?? DELIVERY_BACKOFF_MS[0];
            data = {
              status: DeliveryTaskStatus.RETRY_WAIT,
              nextAttemptAt: new Date(
                now.getTime() + (result.delayMs ?? backoff),
              ),
              lastError: sanitizeDeliveryError(result.reason),
            };
          }
          break;
        case 'failed':
          data = {
            status: DeliveryTaskStatus.FAILED,
            lastError: sanitizeDeliveryError(result.reason),
          };
          break;
        case 'unknown':
          data = {
            status: DeliveryTaskStatus.NEEDS_ATTENTION,
            lastError: sanitizeDeliveryError(result.reason),
          };
          break;
        case 'awaiting_manual':
          data = { status: DeliveryTaskStatus.AWAITING_MANUAL };
          break;
      }
      const moved = await tx.deliveryTask.updateMany({
        where: { id: taskId, leaseToken, status: current.status },
        data: { ...data, leaseUntil: null },
      });
      if (moved.count !== 1) return false;
      await this.syncItemDelivery(tx, current.orderItemId, now);
      return true;
    });
  }

  /// `OrderItem.isDelivered` и `deliveredAt` выводятся из заданий (ADR-0184 п. 4).
  async syncItemDelivery(
    tx: Prisma.TransactionClient,
    orderItemId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const tasks = await tx.deliveryTask.findMany({
      where: { orderItemId },
      select: { status: true },
    });
    const active = tasks.filter(
      (t) => t.status !== DeliveryTaskStatus.CANCELLED,
    );
    const done =
      active.length > 0 &&
      active.every((t) => DONE_STATUSES.includes(t.status));
    if (done) {
      await tx.orderItem.updateMany({
        where: { id: orderItemId, isDelivered: false },
        data: { isDelivered: true, deliveredAt: now },
      });
    } else {
      await tx.orderItem.updateMany({
        where: { id: orderItemId, isDelivered: true },
        data: { isDelivered: false, deliveredAt: null },
      });
    }
  }

  // ------------------------------------------------------- админ-API

  async listTasks(query: ListDeliveryTasksQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const orderNumber = query.orderNumber?.trim();
    const nick = query.nick?.trim();
    const where: Prisma.DeliveryTaskWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.executor ? { executor: query.executor } : {}),
      ...(nick ? { nick: { contains: nick, mode: 'insensitive' } } : {}),
      ...(orderNumber
        ? {
            orderItem: {
              order: {
                orderNumber: { contains: orderNumber, mode: 'insensitive' },
              },
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.deliveryTask.findMany({
        where,
        select: TASK_LIST_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.deliveryTask.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async getTask(id: string) {
    const task = await this.prisma.deliveryTask.findUnique({
      where: { id },
      select: TASK_CARD_SELECT,
    });
    if (!task) throw new NotFoundException('Задание выдачи не найдено');
    return task;
  }

  /// Ручная отметка «выдано» с обязательной причиной. Строка блокируется
  /// (FOR UPDATE), статус проверяется, аудит строгий и в той же транзакции.
  async markManualDone(id: string, actorId: string, reason: string) {
    const text = reason.trim();
    if (!text) throw new BadRequestException('Причина обязательна');
    return this.prisma.$transaction(
      async (tx) => {
        const orderStatus = await this.lockOrderOfTask(tx, id);
        const task = await this.lockTask(tx, id);
        // Заказ возвращён/отменён: отказ без изменений (задание остаётся как
        // есть, ничего не теряется; открытые задания возврат уже отменил).
        this.assertOrderCompleted(orderStatus);
        if (task.status === DeliveryTaskStatus.IN_PROGRESS) {
          throw new ConflictException({
            code: 'delivery_in_progress',
            message: 'Задание выполняется, дождитесь исхода',
          });
        }
        if (!MANUAL_DONE_FROM.includes(task.status)) {
          throw new ConflictException({
            code: 'delivery_invalid_status',
            message: `Отметить выдачу нельзя из статуса ${task.status}`,
          });
        }
        const now = new Date();
        await tx.deliveryTask.update({
          where: { id },
          data: {
            status: DeliveryTaskStatus.MANUAL_DONE,
            deliveredAt: now,
            leaseToken: null,
            leaseUntil: null,
            nextAttemptAt: null,
            lastError: null,
          },
        });
        await this.syncItemDelivery(tx, task.orderItemId, now);
        await this.audit.logInTx(tx, {
          actorId,
          action: 'delivery.task.manual_done',
          targetType: 'delivery_task',
          targetId: id,
          changes: {
            orderItemId: task.orderItemId,
            step: task.step,
            executor: task.executor,
            from: task.status,
            to: DeliveryTaskStatus.MANUAL_DONE,
            ...(task.bridgeJob
              ? { bridgeJobStatus: task.bridgeJob.status }
              : {}),
            reason: text,
          },
        });
        return tx.deliveryTask.findUniqueOrThrow({
          where: { id },
          select: TASK_CARD_SELECT,
        });
      },
      { maxWait: 10_000, timeout: 10_000 },
    );
  }

  /// Ручной повтор из FAILED или NEEDS_ATTENTION с явным подтверждением
  /// («команда могла уже выполниться», Р6).
  ///
  /// Счётчик `attempts` при ручном повторе НЕ сбрасывается (решение по ревью
  /// 0.7, Q1). Следствие: после повтора из FAILED (исчерпан потолок попыток)
  /// воркер делает ровно одну дополнительную попытку, а при неудаче задание
  /// снова уходит в FAILED без автоповторов. Обоснование: сброс дал бы ещё до
  /// `maxAttempts` автоматических запусков, возможно неидемпотентной команды,
  /// после одного подтверждения админа; история попыток и `attempt` в
  /// idempotencyKey/снимке остаются монотонными. Нужна ещё попытка — админ
  /// жмёт «Повторить» снова. Повтор по заказу не в COMPLETED запрещён (409).
  async retryTask(
    id: string,
    actorId: string,
    input: { confirmed: boolean; reason?: string; serverChecked?: boolean },
  ) {
    if (input.confirmed !== true) {
      throw new BadRequestException({
        code: 'delivery_retry_confirmation_required',
        message: 'Подтвердите повтор: команда могла уже выполниться',
      });
    }
    return this.prisma.$transaction(
      async (tx) => {
        const orderStatus = await this.lockOrderOfTask(tx, id);
        const task = await this.lockTask(tx, id);
        this.assertOrderCompleted(orderStatus);
        if (!RETRY_FROM.includes(task.status)) {
          throw new ConflictException({
            code: 'delivery_invalid_status',
            message: `Повтор невозможен из статуса ${task.status}`,
          });
        }
        // R167: исход выдачи через Bridge неизвестен (UNKNOWN/CLAIMED) —
        // повтор возможен только после проверки на сервере и с причиной.
        const bridgeUnsettled =
          task.executor === EXECUTOR_BRIDGE &&
          task.bridgeJob != null &&
          BRIDGE_UNSETTLED.includes(task.bridgeJob.status);
        if (bridgeUnsettled) {
          if (input.serverChecked !== true) {
            throw new BadRequestException({
              code: 'delivery_retry_server_check_required',
              message:
                'Исход выдачи на сервере неизвестен: подтвердите, что проверили сервер и выдачи не было',
            });
          }
          if (!input.reason?.trim()) {
            throw new BadRequestException({
              code: 'delivery_retry_reason_required',
              message:
                'Укажите причину повтора выдачи после неизвестного исхода',
            });
          }
        }
        const executor = this.executors.get(task.executor);
        const target = executor?.automatic
          ? DeliveryTaskStatus.PENDING
          : DeliveryTaskStatus.AWAITING_MANUAL;
        await tx.deliveryTask.update({
          where: { id },
          data: {
            status: target,
            nextAttemptAt: null,
            leaseUntil: null,
            lastError: null,
          },
        });
        await this.audit.logInTx(tx, {
          actorId,
          action: 'delivery.task.retried',
          targetType: 'delivery_task',
          targetId: id,
          severity: 'warning',
          changes: {
            orderItemId: task.orderItemId,
            step: task.step,
            executor: task.executor,
            from: task.status,
            to: target,
            confirmed: true,
            // Для разбора двойной выдачи (R167): что известно об очереди Bridge.
            ...(task.bridgeJob
              ? {
                  bridgeJobStatus: task.bridgeJob.status,
                  bridgeClaimCount: task.bridgeJob.claimCount,
                  // Ключ при повторе тот же (плагин ответит done, если выполнено).
                  bridgeIdempotencyKey: `${task.orderItemId}:${task.step}`,
                  serverChecked: input.serverChecked === true,
                  unsettledRetry: bridgeUnsettled,
                }
              : {}),
            ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
          },
        });
        return tx.deliveryTask.findUniqueOrThrow({
          where: { id },
          select: TASK_CARD_SELECT,
        });
      },
      { maxWait: 10_000, timeout: 10_000 },
    );
  }

  /// Блокирует заказ задания (FOR UPDATE; порядок «заказ, затем задания» тот
  /// же, что у возврата, взаимоблокировок нет) и возвращает его статус.
  /// Нет задания — 404.
  private async lockOrderOfTask(
    tx: Prisma.TransactionClient,
    taskId: string,
  ): Promise<OrderStatus | undefined> {
    const rows = await tx.$queryRaw<{ status: OrderStatus }[]>`
      SELECT o.status FROM orders o
      JOIN order_items i ON i."orderId" = o.id
      JOIN delivery_tasks t ON t."orderItemId" = i.id
      WHERE t.id = ${taskId}
      FOR UPDATE OF o`;
    return rows[0]?.status;
  }

  /// Ручные действия и выдача допустимы только для COMPLETED-заказа: при
  /// возврате или отмене заказ закрыт, выдавать по нему нельзя.
  private assertOrderCompleted(status: OrderStatus | undefined): void {
    if (status !== undefined && status !== OrderStatus.COMPLETED) {
      throw new ConflictException({
        code: 'delivery_order_not_completed',
        message: `Заказ не завершён (статус ${status}): выдача невозможна`,
      });
    }
  }

  private async lockTask(tx: Prisma.TransactionClient, id: string) {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM delivery_tasks WHERE id = ${id} FOR UPDATE`;
    if (locked.length === 0) {
      throw new NotFoundException('Задание выдачи не найдено');
    }
    return tx.deliveryTask.findUniqueOrThrow({
      where: { id },
      select: {
        status: true,
        orderItemId: true,
        step: true,
        executor: true,
        bridgeJob: { select: { status: true, claimCount: true } },
      },
    });
  }

  // ---------------------------------------------- возврат и отзыв (0.9)

  /// Сервисная проверка для возврата (ADR-0184 Р4): возврат запрещён, если
  /// любое задание заказа в DELIVERED, MANUAL_DONE, IN_PROGRESS или
  /// NEEDS_ATTENTION. Строки заданий блокируются (FOR UPDATE), чтобы гонка
  /// «возврат против выдачи» решалась блокировкой (Р5). Сам возврат — 0.9.
  async assertRefundAllowed(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT t.id FROM delivery_tasks t
      JOIN order_items i ON i.id = t."orderItemId"
      WHERE i."orderId" = ${orderId}
      FOR UPDATE OF t`;
    const blocking = await tx.deliveryTask.findMany({
      where: {
        status: { in: [...REFUND_BLOCKING_STATUSES] },
        orderItem: { orderId },
      },
      select: { status: true },
    });
    if (blocking.length === 0) return;
    const delivered = blocking.some((t) => DONE_STATUSES.includes(t.status));
    throw new ConflictException(
      delivered
        ? { code: 'refund_after_delivery', message: 'Товар уже выдан' }
        : { code: 'delivery_in_progress', message: 'Выдача выполняется' },
    );
  }

  /// Отмена невыданных заданий заказа при возврате (ADR-0184 Р5): PENDING,
  /// RETRY_WAIT, FAILED, AWAITING_MANUAL -> CANCELLED. Вызывать после
  /// `assertRefundAllowed` в той же транзакции (строки уже заблокированы).
  async cancelOpenTasks(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<number> {
    const res = await tx.deliveryTask.updateMany({
      where: {
        orderItem: { orderId },
        status: {
          in: [
            DeliveryTaskStatus.PENDING,
            DeliveryTaskStatus.RETRY_WAIT,
            DeliveryTaskStatus.FAILED,
            DeliveryTaskStatus.AWAITING_MANUAL,
          ],
        },
      },
      data: {
        status: DeliveryTaskStatus.CANCELLED,
        lastError: 'refunded',
        leaseToken: null,
        leaseUntil: null,
      },
    });
    return res.count;
  }

  /// Отзыв сайтовой выдачи (вызов из 0.9): удаляет только украшения с
  /// источником PURCHASE и этим заказом (ADMIN и LEGACY не трогает), снимает
  /// выбор украшения, переводит сайтовые задания в CANCELLED и пересчитывает
  /// `isDelivered`. Бейджи и игровые выдачи не отзываются (ADR-0184 п. 8).
  async revokeSiteGrants(
    tx: Prisma.TransactionClient,
    orderId: string,
    actorId?: string,
  ): Promise<{ revokedDecorations: number; cancelledTasks: number }> {
    const grants = await tx.userDecoration.findMany({
      where: { orderId, source: 'PURCHASE' },
      select: { id: true, userId: true, decorationId: true },
    });
    for (const g of grants) {
      await tx.user.updateMany({
        where: { id: g.userId, selectedDecorationId: g.decorationId },
        data: { selectedDecorationId: null },
      });
    }
    if (grants.length > 0) {
      await tx.userDecoration.deleteMany({
        where: { id: { in: grants.map((g) => g.id) } },
      });
    }
    const tasks = await tx.deliveryTask.findMany({
      where: {
        executor: EXECUTOR_SITE,
        status: DeliveryTaskStatus.DELIVERED,
        orderItem: { orderId },
      },
      select: { id: true, orderItemId: true },
    });
    let cancelled = 0;
    for (const t of tasks) {
      const res = await tx.deliveryTask.updateMany({
        where: { id: t.id, status: DeliveryTaskStatus.DELIVERED },
        data: {
          status: DeliveryTaskStatus.CANCELLED,
          lastError: 'revoked',
          leaseToken: null,
          leaseUntil: null,
        },
      });
      cancelled += res.count;
      await this.syncItemDelivery(tx, t.orderItemId);
    }
    if (actorId && (grants.length > 0 || cancelled > 0)) {
      await this.audit.logInTx(tx, {
        actorId,
        action: 'delivery.site.revoked',
        targetType: 'order',
        targetId: orderId,
        severity: 'warning',
        changes: {
          revokedDecorations: grants.length,
          cancelledTasks: cancelled,
        },
      });
    }
    return { revokedDecorations: grants.length, cancelledTasks: cancelled };
  }
}

const TASK_LIST_SELECT = {
  id: true,
  orderItemId: true,
  step: true,
  executor: true,
  status: true,
  attempts: true,
  nextAttemptAt: true,
  nick: true,
  lastError: true,
  deliveredAt: true,
  createdAt: true,
  updatedAt: true,
  /// Состояние очереди Bridge (0.13): только статус и метки, без `claimToken`
  /// и команды. Нужно админке для разбора UNKNOWN и повтора.
  bridgeJob: {
    select: {
      status: true,
      serverSlug: true,
      ackCode: true,
      claimCount: true,
      claimedAt: true,
      ackedAt: true,
      attempt: true,
    },
  },
  orderItem: {
    select: {
      id: true,
      quantity: true,
      order: { select: { id: true, orderNumber: true, status: true } },
      product: { select: { id: true, name: true, type: true } },
    },
  },
} satisfies Prisma.DeliveryTaskSelect;

/// Карточка: то же и снимок для аудита; токена аренды и платёжных полей нет.
const TASK_CARD_SELECT = {
  ...TASK_LIST_SELECT,
  leaseUntil: true,
  recipientUserId: true,
  renderedCommand: true,
  templateVersion: true,
} satisfies Prisma.DeliveryTaskSelect;
