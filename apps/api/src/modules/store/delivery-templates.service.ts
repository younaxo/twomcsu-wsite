import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { TwoFactorService } from '../auth/two-factor/two-factor.service';
import { INCR_EXPIRE_SCRIPT } from '../bridge/bridge-redis.service';
import {
  CommandTemplateError,
  DEFAULT_COMMAND_ROOTS,
  EXTRA_ROOTS_SETTING,
  FORBIDDEN_COMMAND_ROOTS,
  normalizeRoots,
  renderCommand,
  validateTemplate,
} from '../delivery/command-template';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  PreviewDeliveryTemplateDto,
  SetCommandRootsDto,
  UpsertDeliveryTemplateDto,
} from './dto/delivery-template.dto';

/// Защита кода 2FA от перебора: не более N неверных кодов за окно (как у
/// возвратов, ADR-0188 п. 14).
const TWO_FACTOR_MAX_FAILURES = 5;
const TWO_FACTOR_WINDOW_SECONDS = 15 * 60;
const failKey = (actorId: string) => `store:template:2fa-fail:${actorId}`;

export const scopeKeyOf = (productId: string, variantId?: string | null) =>
  `${productId}:${variantId ?? '*'}`;

const badTemplate = (e: CommandTemplateError) =>
  new BadRequestException({ code: e.code, message: e.message });

function forbidden(code: string, message: string) {
  return new HttpException({ code, message }, HttpStatus.FORBIDDEN);
}

/// Шаблоны игровых команд (0.11, ADR-0189): право
/// `store.delivery.templates.manage`, свежая TOTP-2FA, аудит «было/стало».
/// Шаблон никогда не отправляется отсюда: preview только подставляет значения.
@Injectable()
export class DeliveryTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly twoFactor: TwoFactorService,
    private readonly redis: RedisService,
  ) {}

  async list(productId?: string) {
    return this.prisma.deliveryCommandTemplate.findMany({
      where: productId ? { productId } : {},
      orderBy: [{ productId: 'asc' }, { scopeKey: 'asc' }],
      take: 500,
    });
  }

  /// Итоговая команда без отправки. Ничего не пишет.
  async preview(dto: PreviewDeliveryTemplateDto): Promise<{ command: string }> {
    const extra = await this.extraRoots();
    try {
      return {
        command: renderCommand(
          dto.template,
          { username: dto.username, duration: dto.duration },
          extra,
        ),
      };
    } catch (error) {
      if (error instanceof CommandTemplateError) throw badTemplate(error);
      throw error;
    }
  }

  /// Расширение белого списка: хранится в `site_settings`; битое значение
  /// трактуется как «нет расширения».
  private async extraRoots(): Promise<string[]> {
    const row = await this.prisma.siteSetting.findUnique({
      where: { key: EXTRA_ROOTS_SETTING },
    });
    try {
      return normalizeRoots(row?.value ?? '');
    } catch {
      return [];
    }
  }

  async getRoots() {
    return {
      defaults: [...DEFAULT_COMMAND_ROOTS],
      forbidden: [...FORBIDDEN_COMMAND_ROOTS],
      extra: await this.extraRoots(),
    };
  }

  /// Расширение корней: право `store.delivery.templates.manage`, свежая
  /// 2FA, аудит. Запрещённые корни отклоняются.
  async setRoots(dto: SetCommandRootsDto, actorId: string) {
    let roots: string[];
    try {
      roots = normalizeRoots(dto.roots);
    } catch (error) {
      if (error instanceof CommandTemplateError) throw badTemplate(error);
      throw error;
    }
    await this.assertFreshTwoFactor(actorId, dto.twoFactorCode);
    const value = roots.join(',');
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.siteSetting.findUnique({
        where: { key: EXTRA_ROOTS_SETTING },
      });
      await tx.siteSetting.upsert({
        where: { key: EXTRA_ROOTS_SETTING },
        create: { key: EXTRA_ROOTS_SETTING, value },
        update: { value },
      });
      await this.audit.logInTx(tx, {
        actorId,
        action: 'store.delivery.roots.updated',
        targetType: 'site_setting',
        targetId: EXTRA_ROOTS_SETTING,
        severity: 'critical',
        changes: {
          before: before?.value ?? '',
          after: value,
        } as Prisma.InputJsonValue,
      });
    });
    return { extra: roots };
  }

  async upsert(
    productId: string,
    dto: UpsertDeliveryTemplateDto,
    actorId: string,
  ) {
    let template: string;
    try {
      template = validateTemplate(dto.template, await this.extraRoots());
    } catch (error) {
      if (error instanceof CommandTemplateError) throw badTemplate(error);
      throw error;
    }
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, slug: true },
    });
    if (!product) throw new NotFoundException('Товар не найден');
    if (dto.variantId) {
      const variant = await this.prisma.productVariant.findFirst({
        where: { id: dto.variantId, productId },
        select: { id: true },
      });
      if (!variant) throw new NotFoundException('Вариант товара не найден');
    }
    // Существование товара и варианта проверено ДО 2FA: код не сгорает
    // из-за опечатки в id.
    await this.assertFreshTwoFactor(actorId, dto.twoFactorCode);
    const scopeKey = scopeKeyOf(productId, dto.variantId);

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.deliveryCommandTemplate.findUnique({
        where: { scopeKey },
      });
      const saved = before
        ? await tx.deliveryCommandTemplate.update({
            where: { scopeKey },
            data: {
              template,
              version: { increment: 1 },
              updatedBy: actorId,
            },
          })
        : await tx.deliveryCommandTemplate.create({
            data: {
              productId,
              variantId: dto.variantId ?? null,
              scopeKey,
              template,
              updatedBy: actorId,
            },
          });
      // Аудит строгий: сбой записи откатывает изменение.
      await this.audit.logInTx(tx, {
        actorId,
        action: 'store.delivery.template.updated',
        targetType: 'product',
        targetId: productId,
        severity: 'critical',
        changes: {
          scopeKey,
          variantId: dto.variantId ?? null,
          productSlug: product.slug,
          before: before
            ? { template: before.template, version: before.version }
            : null,
          after: { template: saved.template, version: saved.version },
        } as Prisma.InputJsonValue,
      });
      return saved;
    });
  }

  /// Свежий код: только TOTP, резервные коды не подходят; шаг одноразовый.
  private async assertFreshTwoFactor(
    actorId: string,
    code: string | undefined,
  ): Promise<void> {
    if (!code || !code.trim()) {
      throw forbidden('two_factor_required', 'Нужен свежий код 2FA');
    }
    const key = failKey(actorId);
    const failures = Number(await this.redis.client.get(key)) || 0;
    if (failures >= TWO_FACTOR_MAX_FAILURES) {
      throw new HttpException(
        {
          code: 'template_two_factor_locked',
          message: 'Слишком много неверных кодов. Повторите позже',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const method = await this.twoFactor.verify(actorId, code, {
      allowBackup: false,
    });
    if (method !== 'totp') {
      // INCR + EXPIRE атомарно одним Lua-скриптом (без «вечного» счётчика).
      await this.redis.client.eval(
        INCR_EXPIRE_SCRIPT,
        1,
        key,
        '1',
        String(TWO_FACTOR_WINDOW_SECONDS),
        'first',
      );
      throw forbidden('two_factor_invalid', 'Неверный код 2FA');
    }
    await this.redis.client.del(key);
  }
}
