import type { PrismaService } from '../prisma/prisma.service';
import {
  PunishmentsSettingsService,
  SETTING_HIDE_SILENT,
  SETTING_PUBLIC_ENABLED,
  SETTING_REASON_MAP,
  SETTING_REASON_MAP_ENABLED,
} from './punishments-settings.service';

/// Контракт 5 и 3.2: настройки публичного слоя из SiteSetting (мок Prisma).
function make(rows: Array<{ key: string; value: string }>) {
  const prisma = {
    siteSetting: {
      findUnique: jest.fn(({ where }: { where: { key: string } }) =>
        Promise.resolve(rows.find((r) => r.key === where.key) ?? null),
      ),
      findMany: jest.fn(() => Promise.resolve(rows)),
    },
  };
  return {
    prisma,
    service: new PunishmentsSettingsService(prisma as unknown as PrismaService),
  };
}

describe('PunishmentsSettingsService', () => {
  it('раздел выключен по умолчанию и при любом значении кроме "true"', async () => {
    expect(await make([]).service.isPublicEnabled()).toBe(false);
    for (const value of ['false', 'TRUE', '1', '']) {
      const { service } = make([{ key: SETTING_PUBLIC_ENABLED, value }]);
      expect(await service.isPublicEnabled()).toBe(false);
    }
    expect(
      await make([
        { key: SETTING_PUBLIC_ENABLED, value: 'true' },
      ]).service.isPublicEnabled(),
    ).toBe(true);
  });

  it('readPublic: значения по умолчанию - выключено, hideSilent true, карта пуста', async () => {
    const s = await make([]).service.readPublic();
    expect(s.enabled).toBe(false);
    expect(s.hideSilent).toBe(true);
    expect(s.reasonMap.enabled).toBe(false);
    expect(s.reasonMap.templates.size).toBe(0);
    expect(s.reasonMap.phrases.size).toBe(0);
  });

  it('hideSilent выключается только значением "false"', async () => {
    const off = await make([
      { key: SETTING_HIDE_SILENT, value: 'false' },
    ]).service.readPublic();
    expect(off.hideSilent).toBe(false);
    const other = await make([
      { key: SETTING_HIDE_SILENT, value: '0' },
    ]).service.readPublic();
    expect(other.hideSilent).toBe(true);
  });

  it('карта подхватывается только вместе с флагом enabled', async () => {
    const mapJson = JSON.stringify({ phrases: { читы: 'cheats' } });
    const noFlag = await make([
      { key: SETTING_REASON_MAP, value: mapJson },
    ]).service.readPublic();
    expect(noFlag.reasonMap.phrases.size).toBe(0);
    const withFlag = await make([
      { key: SETTING_REASON_MAP, value: mapJson },
      { key: SETTING_REASON_MAP_ENABLED, value: 'true' },
    ]).service.readPublic();
    expect(withFlag.reasonMap.enabled).toBe(true);
    expect(withFlag.reasonMap.phrases.get('читы')).toBe('cheats');
  });

  it('fingerprint меняется при смене настройки (входит в ключ кэша)', async () => {
    const a = await make([]).service.readPublic();
    const b = await make([
      { key: SETTING_PUBLIC_ENABLED, value: 'true' },
    ]).service.readPublic();
    const c = await make([
      { key: SETTING_HIDE_SILENT, value: 'false' },
    ]).service.readPublic();
    const d = await make([
      { key: SETTING_REASON_MAP_ENABLED, value: 'true' },
      { key: SETTING_REASON_MAP, value: '{}' },
    ]).service.readPublic();
    const prints = new Set([a, b, c, d].map((x) => x.fingerprint));
    expect(prints.size).toBe(4);
  });

  it('читает только четыре известных ключа одной выборкой', async () => {
    const { prisma, service } = make([]);
    await service.readPublic();
    expect(prisma.siteSetting.findMany).toHaveBeenCalledTimes(1);
    const arg = (
      prisma.siteSetting.findMany.mock.calls as unknown[][]
    )[0][0] as {
      where: { key: { in: string[] } };
    };
    expect(arg.where.key.in.sort()).toEqual(
      [
        SETTING_PUBLIC_ENABLED,
        SETTING_HIDE_SILENT,
        SETTING_REASON_MAP,
        SETTING_REASON_MAP_ENABLED,
      ].sort(),
    );
  });
});
