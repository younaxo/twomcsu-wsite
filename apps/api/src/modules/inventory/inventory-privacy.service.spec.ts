import { UnprocessableEntityException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { InventoryPrivacyService } from './inventory-privacy.service';

type Row = { inventoryPublic: boolean; enderPublic: boolean };

function setup(initial: Row | null = null) {
  let row: Row | null = initial;
  const privacy = {
    findUnique: jest.fn(() => Promise.resolve(row)),
    upsert: jest.fn(
      (args: { create: Row & { userId: string }; update: Row }) => {
        row = row
          ? { ...args.update }
          : {
              inventoryPublic: args.create.inventoryPublic,
              enderPublic: args.create.enderPublic,
            };
        return Promise.resolve(row);
      },
    ),
  };
  const service = new InventoryPrivacyService({
    inventoryPrivacy: privacy,
  } as unknown as PrismaService);
  return { service, privacy, current: () => row };
}

describe('InventoryPrivacyService', () => {
  it('по умолчанию (нет строки) — приватно, Ender скрыт', async () => {
    const { service } = setup();
    expect(await service.get('u1')).toEqual({
      inventoryPublic: false,
      enderPublic: false,
    });
  });

  it('GET не показывает Ender публичным без публичного инвентаря', async () => {
    const { service } = setup({ inventoryPublic: false, enderPublic: true });
    expect(await service.get('u1')).toEqual({
      inventoryPublic: false,
      enderPublic: false,
    });
  });

  it('делает инвентарь публичным, Ender остаётся скрытым', async () => {
    const { service, privacy } = setup();
    expect(await service.update('u1', { inventoryPublic: true })).toEqual({
      inventoryPublic: true,
      enderPublic: false,
    });
    expect(privacy.upsert).toHaveBeenCalledTimes(1);
  });

  it('Ender можно открыть только при публичном инвентаре', async () => {
    const { service, privacy } = setup();
    await expect(
      service.update('u1', { enderPublic: true }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      service.update('u1', { inventoryPublic: false, enderPublic: true }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(privacy.upsert).not.toHaveBeenCalled();
    // Вместе с открытием инвентаря — можно.
    expect(
      await service.update('u1', { inventoryPublic: true, enderPublic: true }),
    ).toEqual({ inventoryPublic: true, enderPublic: true });
  });

  it('скрытие инвентаря скрывает и Ender Chest', async () => {
    const { service, current } = setup({
      inventoryPublic: true,
      enderPublic: true,
    });
    expect(await service.update('u1', { inventoryPublic: false })).toEqual({
      inventoryPublic: false,
      enderPublic: false,
    });
    expect(current()).toEqual({ inventoryPublic: false, enderPublic: false });
  });

  it('закрытие только Ender не трогает инвентарь', async () => {
    const { service } = setup({ inventoryPublic: true, enderPublic: true });
    expect(await service.update('u1', { enderPublic: false })).toEqual({
      inventoryPublic: true,
      enderPublic: false,
    });
  });

  it('пустой PATCH — 422 invalid_param', async () => {
    const { service } = setup();
    await expect(service.update('u1', {})).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    try {
      await service.update('u1', {});
    } catch (error) {
      expect(
        (error as UnprocessableEntityException).getResponse(),
      ).toMatchObject({ code: 'invalid_param' });
    }
  });

  it('при открытии Ender у уже публичного инвентаря — принимает', async () => {
    const { service } = setup({ inventoryPublic: true, enderPublic: false });
    expect(await service.update('u1', { enderPublic: true })).toEqual({
      inventoryPublic: true,
      enderPublic: true,
    });
  });
});
