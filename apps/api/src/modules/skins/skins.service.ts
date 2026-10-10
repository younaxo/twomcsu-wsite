import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { resolveUserIdByHandle } from '../profiles/handle';
import { SKIN_SOURCE, type SkinModel, type SkinSource } from './skin-source';

/// Скины игроков для 3D-просмотра в профиле (ADR-0089). Сайт сам получает
/// и кэширует текстуры — браузер не зависит от сторонних API и CORS.

const HIT_TTL_MS = 6 * 60 * 60_000;
const MISS_TTL_MS = 30 * 60_000;
const ERROR_TTL_MS = 2 * 60_000;
const MAX_ENTRIES = 1000;
const NICK = /^[A-Za-z0-9_]{3,16}$/;

export interface CachedSkin {
  model: SkinModel;
  skin: Buffer;
  cape: Buffer | null;
  /// Хеш текстур — для `?v=` в URL (кэш браузера сбрасывается при смене скина).
  version: string;
}

interface Entry {
  value: CachedSkin | null;
  expiresAt: number;
}

export interface SkinMeta {
  available: boolean;
  model: SkinModel | null;
  cape: boolean;
  version: string | null;
}

@Injectable()
export class SkinsService {
  private readonly logger = new Logger(SkinsService.name);
  private readonly cache = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<CachedSkin | null>>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SKIN_SOURCE) private readonly source: SkinSource,
  ) {}

  /// Ник Minecraft пользователя сайта: привязанный аккаунт, иначе ник сайта
  /// (он же Minecraft-ник, ADR-0072). Нет пользователя или профиль скрыт от
  /// всех — 404 одинаково: эндпоинт не раскрывает, есть ли аккаунт.
  private async minecraftName(username: string): Promise<string> {
    // Ник сайта, alias входа или ник привязки (`younaxo` → `younaxo_`).
    const id = await resolveUserIdByHandle(this.prisma, username);
    const user = await this.prisma.user.findFirst({
      where: { id: id ?? '__none__' },
      select: {
        username: true,
        profileVisibility: true,
        minecraftAccount: { select: { name: true } },
      },
    });
    const name = user?.minecraftAccount?.name ?? user?.username;
    if (
      !user ||
      user.profileVisibility === 'NOBODY' ||
      !name ||
      !NICK.test(name)
    ) {
      throw new NotFoundException('Скин не найден');
    }
    return name;
  }

  private remember(key: string, value: CachedSkin | null, ttl: number) {
    if (this.cache.size >= MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + ttl });
  }

  async getSkin(username: string): Promise<CachedSkin | null> {
    const name = await this.minecraftName(username);
    const key = name.toLowerCase();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const load = (async () => {
      try {
        const textures = await this.source.fetchByName(name);
        const value = textures
          ? {
              ...textures,
              version: createHash('sha256')
                .update(textures.skin)
                .update(textures.cape ?? Buffer.alloc(0))
                .digest('hex')
                .slice(0, 12),
            }
          : null;
        this.remember(key, value, value ? HIT_TTL_MS : MISS_TTL_MS);
        return value;
      } catch (error) {
        // Сбой Mojang — короткий negative-кэш, чтобы не долбить API; старое
        // значение (если было) отдаём дальше.
        this.logger.warn(
          `Скин ${name} недоступен: ${error instanceof Error ? error.message.slice(0, 80) : 'ошибка'}`,
        );
        const stale = cached?.value ?? null;
        this.remember(key, stale, ERROR_TTL_MS);
        return stale;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, load);
    return load;
  }

  async meta(username: string): Promise<SkinMeta> {
    const skin = await this.getSkin(username);
    return skin
      ? {
          available: true,
          model: skin.model,
          cape: !!skin.cape,
          version: skin.version,
        }
      : { available: false, model: null, cape: false, version: null };
  }
}
