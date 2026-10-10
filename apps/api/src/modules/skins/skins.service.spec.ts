import { NotFoundException } from '@nestjs/common';
import {
  isCapePng,
  isSkinPng,
  parseTexturesProperty,
  type SkinSource,
  type SkinTextures,
} from './skin-source';
import { SkinsService } from './skins.service';

/// PNG-заголовок нужного размера (сигнатура + IHDR) — для проверок формата.
function png(width: number, height: number): Buffer {
  const data = Buffer.alloc(33);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(data, 0);
  data.writeUInt32BE(13, 8);
  data.write('IHDR', 12, 'ascii');
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  return data;
}

function service(
  users: Record<string, { profileVisibility: string; mc?: string }>,
  source: SkinSource,
) {
  const prisma = {
    user: {
      findFirst: jest.fn(
        async ({ where }: { where: { username: { equals: string } } }) => {
          const key = Object.keys(users).find(
            (name) =>
              name.toLowerCase() === where.username.equals.toLowerCase(),
          );
          if (!key) return null;
          const user = users[key]!;
          return {
            username: key,
            profileVisibility: user.profileVisibility,
            minecraftAccount: user.mc ? { name: user.mc } : null,
          };
        },
      ),
    },
  };
  return new SkinsService(prisma as never, source);
}

const textures: SkinTextures = {
  model: 'slim',
  skin: png(64, 64),
  cape: png(64, 32),
};

describe('скины (ADR-0089)', () => {
  it('textures из sessionserver: только textures.minecraft.net, https, модель slim', () => {
    const value = Buffer.from(
      JSON.stringify({
        textures: {
          SKIN: {
            url: 'http://textures.minecraft.net/texture/abc',
            metadata: { model: 'slim' },
          },
          CAPE: { url: 'https://evil.example/cape.png' },
        },
      }),
    ).toString('base64');
    expect(parseTexturesProperty(value)).toEqual({
      skinUrl: 'https://textures.minecraft.net/texture/abc',
      capeUrl: null,
      model: 'slim',
    });
    expect(parseTexturesProperty('не base64 json').skinUrl).toBeNull();
  });

  it('формат текстур: скин 64×64 / 64×32, плащ 2:1; мусор отклоняется', () => {
    expect(isSkinPng(png(64, 64))).toBe(true);
    expect(isSkinPng(png(64, 32))).toBe(true);
    expect(isSkinPng(png(128, 128))).toBe(false);
    expect(isSkinPng(Buffer.from('GIF89a……………………………………'))).toBe(false);
    expect(isCapePng(png(64, 32))).toBe(true);
    expect(isCapePng(png(64, 64))).toBe(false);
  });

  it('ник Minecraft — из привязки, иначе ник сайта; результат кэшируется, параллельные запросы — один', async () => {
    const fetchByName = jest.fn(async () => textures);
    const skins = service(
      { Steve: { profileVisibility: 'EVERYONE', mc: 'SteveMC' } },
      { fetchByName },
    );
    const [a, b] = await Promise.all([
      skins.getSkin('steve'),
      skins.getSkin('STEVE'),
    ]);
    expect(a).toBe(b);
    expect(fetchByName).toHaveBeenCalledTimes(1);
    expect(fetchByName).toHaveBeenCalledWith('SteveMC');
    await skins.getSkin('Steve');
    expect(fetchByName).toHaveBeenCalledTimes(1);
    expect(await skins.meta('Steve')).toEqual({
      available: true,
      model: 'slim',
      cape: true,
      version: expect.stringMatching(/^[0-9a-f]{12}$/),
    });
  });

  it('нет пользователя или профиль скрыт от всех — одинаковый 404 (без перебора аккаунтов)', async () => {
    const fetchByName = jest.fn(async () => textures);
    const skins = service(
      { Hidden: { profileVisibility: 'NOBODY' } },
      { fetchByName },
    );
    await expect(skins.getSkin('Hidden')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(skins.getSkin('Nobody_Here')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(fetchByName).not.toHaveBeenCalled();
  });

  it('нет лицензионного скина — available: false; сбой Mojang — не падаем', async () => {
    const skins = service(
      {
        Pirate: { profileVisibility: 'EVERYONE' },
        Flaky: { profileVisibility: 'EVERYONE' },
      },
      {
        fetchByName: async (name) => {
          if (name === 'Flaky') throw new Error('timeout');
          return null;
        },
      },
    );
    expect(await skins.meta('Pirate')).toEqual({
      available: false,
      model: null,
      cape: false,
      version: null,
    });
    expect((await skins.meta('Flaky')).available).toBe(false);
  });
});
