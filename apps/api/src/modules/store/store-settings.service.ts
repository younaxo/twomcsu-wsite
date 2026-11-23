import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

/// Тексты и правила магазина (0.11, ADR-0189): хранятся в `site_settings`
/// (ключ/значение), редактируются без деплоя. Только простой текст.
export const STORE_TEXT_KEYS = {
  'store.text.unban_rules': 4000,
  'store.text.unmute_rules': 4000,
  'store.text.refund_policy': 8000,
  'store.text.perk_descriptions': 8000,
  'store.text.shop_intro': 2000,
  'store.text.checkout_notice': 2000,
} as const;
export type StoreTextKey = keyof typeof STORE_TEXT_KEYS;

// Переводы строк и табуляция допустимы; остальные управляющие символы нет.
// eslint-disable-next-line no-control-regex
const BAD_CHARS =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/;

@Injectable()
export class StoreSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /// Все тексты (отсутствующие — пустая строка). Публичны: поэтому ТОЛЬКО
  /// ключи `store.text.*` из белого списка.
  async getTexts(): Promise<Record<StoreTextKey, string>> {
    const keys = Object.keys(STORE_TEXT_KEYS) as StoreTextKey[];
    const rows = await this.prisma.siteSetting.findMany({
      where: { key: { in: keys } },
    });
    const result = {} as Record<StoreTextKey, string>;
    for (const key of keys) {
      result[key] = rows.find((r) => r.key === key)?.value ?? '';
    }
    return result;
  }

  async update(values: Record<string, unknown>, actorId: string) {
    const entries = Object.entries(values);
    if (entries.length === 0) {
      throw new BadRequestException('Нет значений для сохранения');
    }
    const clean: [StoreTextKey, string][] = [];
    for (const [key, value] of entries) {
      if (!Object.prototype.hasOwnProperty.call(STORE_TEXT_KEYS, key)) {
        throw new BadRequestException({
          code: 'unknown_setting',
          message: `Неизвестная настройка ${key}`,
        });
      }
      const max = STORE_TEXT_KEYS[key as StoreTextKey];
      if (typeof value !== 'string' || BAD_CHARS.test(value)) {
        throw new BadRequestException({
          code: 'invalid_setting_value',
          message: `Значение ${key}: нужен текст без управляющих символов`,
        });
      }
      const text = value.trim();
      if (text.length > max) {
        throw new BadRequestException({
          code: 'setting_too_long',
          message: `Значение ${key} длиннее ${max} символов`,
        });
      }
      clean.push([key as StoreTextKey, text]);
    }
    await this.prisma.$transaction(async (tx) => {
      for (const [key, text] of clean) {
        const before = await tx.siteSetting.findUnique({ where: { key } });
        if ((before?.value ?? '') === text) continue;
        await tx.siteSetting.upsert({
          where: { key },
          create: { key, value: text },
          update: { value: text },
        });
        await this.audit.logInTx(tx, {
          actorId,
          action: 'store.settings.updated',
          targetType: 'site_setting',
          targetId: key,
          severity: 'warning',
          changes: {
            key,
            before: before?.value ?? null,
            after: text,
          } as Prisma.InputJsonValue,
        });
      }
    });
    return this.getTexts();
  }
}
