import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { InventoryPrivacyDto } from '@twomc/shared';
import { PrismaService } from '../prisma/prisma.service';

/// Настройки приватности инвентаря (ADR-0168, раздел 6.1, Q34 (а)): для всех,
/// по умолчанию «приватно» (нет строки = приватно). Ender Chest публичен
/// только при публичном основном инвентаре.
@Injectable()
export class InventoryPrivacyService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<InventoryPrivacyDto> {
    const row = await this.prisma.inventoryPrivacy.findUnique({
      where: { userId },
      select: { inventoryPublic: true, enderPublic: true },
    });
    if (!row) return { inventoryPublic: false, enderPublic: false };
    return {
      inventoryPublic: row.inventoryPublic,
      // Защита от рассогласования в БД: Ender без основного не бывает.
      enderPublic: row.inventoryPublic && row.enderPublic,
    };
  }

  async update(
    userId: string,
    patch: { inventoryPublic?: boolean; enderPublic?: boolean },
  ): Promise<InventoryPrivacyDto> {
    if (
      patch.inventoryPublic === undefined &&
      patch.enderPublic === undefined
    ) {
      throw new UnprocessableEntityException({
        code: 'invalid_param',
        message: 'Нужно хотя бы одно поле',
      });
    }
    const current = await this.get(userId);
    const inventoryPublic = patch.inventoryPublic ?? current.inventoryPublic;
    let enderPublic = patch.enderPublic ?? current.enderPublic;
    if (patch.enderPublic === true && !inventoryPublic) {
      throw new UnprocessableEntityException({
        code: 'invalid_param',
        message:
          'Ender Chest может быть публичным только при публичном инвентаре',
      });
    }
    // Скрытие основного инвентаря скрывает и Ender Chest.
    if (!inventoryPublic) enderPublic = false;
    const saved = await this.prisma.inventoryPrivacy.upsert({
      where: { userId },
      create: { userId, inventoryPublic, enderPublic },
      update: { inventoryPublic, enderPublic },
      select: { inventoryPublic: true, enderPublic: true },
    });
    return {
      inventoryPublic: saved.inventoryPublic,
      enderPublic: saved.enderPublic,
    };
  }
}
