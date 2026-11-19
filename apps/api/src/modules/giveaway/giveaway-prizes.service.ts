import { promises as fs } from 'fs';
import { resolve } from 'path';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GIVEAWAY_CONFIG, GiveawayConfig } from './giveaway.config';
import { PRIZE_IMAGE_PATTERN } from './giveaway.constants';
import { GiveawayAdminAuditService } from './giveaway-admin-audit.service';
import { badRequest, conflict, notFound } from './giveaway-errors';
import { ConfigPrize, GIVEAWAY_PRIZES_CONFIG } from './giveaway-prizes-config';

export interface PrizeView {
  id: string;
  name: string;
  quantity: number;
  imageFile: string | null;
  priority: number;
}

export interface PrizeInput {
  name?: string;
  quantity?: number;
  imageFile?: string | null;
  priority?: number;
}

/// Призы (ADR-G003 п. 5.5, решение владельца Q97): единственный источник -
/// `giveaway/config/prizes.json` (читается при старте, только чтение). Методы
/// работы с таблицей `giveaway_prizes` (listImages, isLocked, create, update,
/// remove, orderedFromDb) сохранены, но НЕ используются: админ-CRUD отключён.
@Injectable()
export class GiveawayPrizesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: GiveawayAdminAuditService,
    @Inject(GIVEAWAY_CONFIG) private readonly config: GiveawayConfig,
    @Inject(GIVEAWAY_PRIZES_CONFIG)
    private readonly configPrizes: readonly ConfigPrize[],
  ) {}

  /// Призы из конфига по местам; одно место = один победитель (quantity 1).
  /// Конфиг неизменяем в процессе, поэтому расчёт не зависит от гонок правок.
  ordered(): Promise<PrizeView[]> {
    return Promise.resolve(
      this.configPrizes.map((p) => ({
        id: `place-${p.place}`,
        name: p.title,
        quantity: 1,
        imageFile: p.image,
        priority: p.place,
      })),
    );
  }

  /// Для админки: только чтение (`locked: true`, `source: 'config'`).
  configList() {
    return {
      source: 'config' as const,
      locked: true,
      items: this.configPrizes.map((p) => ({
        id: `place-${p.place}`,
        name: p.title,
        quantity: 1,
        imageFile: p.image as string | null,
        priority: p.place,
        place: p.place,
        description: p.description,
      })),
    };
  }

  async listImages(): Promise<string[]> {
    try {
      const dir = resolve(process.cwd(), this.config.admin.prizesDir);
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries
        .filter((e) => e.isFile() && PRIZE_IMAGE_PATTERN.test(e.name))
        .map((e) => e.name)
        .sort();
    } catch {
      return [];
    }
  }

  private async checkImage(file: string | null | undefined): Promise<void> {
    if (file === null || file === undefined) return;
    if (!PRIZE_IMAGE_PATTERN.test(file)) throw badRequest('invalid_image');
    if (!(await this.listImages()).includes(file)) {
      throw badRequest('invalid_image');
    }
  }

  async isLocked(): Promise<boolean> {
    const draw = await this.prisma.giveawayDraw.findUnique({
      where: { context: 'live' },
      select: { status: true },
    });
    return (
      draw !== null &&
      (draw.status === 'calculated' || draw.status === 'broadcast')
    );
  }

  private view(p: PrizeView): PrizeView {
    return {
      id: p.id,
      name: p.name,
      quantity: p.quantity,
      imageFile: p.imageFile,
      priority: p.priority,
    };
  }

  /// @deprecated не используется (призы из конфига); таблица сохранена.
  async orderedFromDb(): Promise<PrizeView[]> {
    const rows = await this.prisma.giveawayPrize.findMany({
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => this.view(r));
  }

  /// @deprecated не используется: см. configList().
  async list(): Promise<{ items: PrizeView[]; locked: boolean }> {
    return { items: await this.orderedFromDb(), locked: await this.isLocked() };
  }

  /** @deprecated админ-CRUD отключён (призы из конфига) */
  async create(input: PrizeInput, actor: string): Promise<PrizeView> {
    if (await this.isLocked()) throw conflict('draw_locked');
    await this.checkImage(input.imageFile);
    let priority = input.priority;
    if (priority === undefined) {
      const agg = await this.prisma.giveawayPrize.aggregate({
        _max: { priority: true },
      });
      priority = (agg._max.priority ?? 0) + 1;
    }
    const row = await this.prisma.giveawayPrize.create({
      data: {
        name: input.name as string,
        quantity: input.quantity as number,
        imageFile: input.imageFile ?? null,
        priority,
      },
    });
    await this.audit.record({
      actor,
      action: 'prize_create',
      objectType: 'prize',
      objectId: row.id,
      mode: 'live',
      detail: `${row.name} x${row.quantity}`,
    });
    return this.view(row);
  }

  /** @deprecated админ-CRUD отключён (призы из конфига) */
  async update(
    id: string,
    input: PrizeInput,
    actor: string,
  ): Promise<PrizeView> {
    if (await this.isLocked()) throw conflict('draw_locked');
    await this.checkImage(input.imageFile);
    const exists = await this.prisma.giveawayPrize.findUnique({
      where: { id },
    });
    if (exists === null) throw notFound();
    const data: PrizeInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.quantity !== undefined) data.quantity = input.quantity;
    if (input.imageFile !== undefined) data.imageFile = input.imageFile;
    if (input.priority !== undefined) data.priority = input.priority;
    const row = await this.prisma.giveawayPrize.update({
      where: { id },
      data,
    });
    await this.audit.record({
      actor,
      action: 'prize_update',
      objectType: 'prize',
      objectId: id,
      mode: 'live',
      detail: Object.keys(data).join(','),
    });
    return this.view(row);
  }

  /** @deprecated админ-CRUD отключён (призы из конфига) */
  async remove(id: string, actor: string): Promise<void> {
    if (await this.isLocked()) throw conflict('draw_locked');
    const exists = await this.prisma.giveawayPrize.findUnique({
      where: { id },
    });
    if (exists === null) throw notFound();
    await this.prisma.giveawayPrize.delete({ where: { id } });
    await this.audit.record({
      actor,
      action: 'prize_delete',
      objectType: 'prize',
      objectId: id,
      mode: 'live',
      detail: exists.name,
    });
  }
}
