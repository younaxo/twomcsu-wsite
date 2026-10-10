/// Источник скинов Minecraft (ADR-0089). Сейчас — официальный API Mojang;
/// когда появится плагин серверов (R20), сюда добавится источник с сервера
/// (SkinsRestorer и т.п.) без изменений контроллера и web.

export type SkinModel = 'classic' | 'slim';

export interface SkinTextures {
  model: SkinModel;
  skin: Buffer;
  cape: Buffer | null;
}

export interface SkinSource {
  /// null — у ника нет лицензионного профиля или скина.
  fetchByName(name: string): Promise<SkinTextures | null>;
}

export const SKIN_SOURCE = Symbol('SKIN_SOURCE');

const TIMEOUT_MS = 5000;
/// Скин 64×64 (или старый 64×32) весит единицы КБ; больше — не скин.
const MAX_TEXTURE_BYTES = 64 * 1024;
const TEXTURE_HOST = 'textures.minecraft.net';

/// PNG нужного размера: сигнатура + IHDR (ширина/высота в байтах 16–23).
export function readPngSize(data: Buffer): { width: number; height: number } | null {
  const signature = '89504e470d0a1a0a';
  if (data.length < 24 || data.subarray(0, 8).toString('hex') !== signature) return null;
  if (data.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

export function isSkinPng(data: Buffer): boolean {
  const size = readPngSize(data);
  return !!size && size.width === 64 && (size.height === 64 || size.height === 32);
}

export function isCapePng(data: Buffer): boolean {
  const size = readPngSize(data);
  // Плащи: 64×32 и HD-варианты кратного размера (22×17 полезной области).
  return !!size && size.width >= 22 && size.width <= 512 && size.height * 2 === size.width;
}

interface TexturesPayload {
  textures?: {
    SKIN?: { url?: string; metadata?: { model?: string } };
    CAPE?: { url?: string };
  };
}

/// Разбор свойства `textures` из sessionserver (base64 JSON). Ссылки — только
/// на textures.minecraft.net (всегда https), иначе текстура игнорируется.
export function parseTexturesProperty(value: string): {
  skinUrl: string | null;
  capeUrl: string | null;
  model: SkinModel;
} {
  let payload: TexturesPayload;
  try {
    payload = JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as TexturesPayload;
  } catch {
    return { skinUrl: null, capeUrl: null, model: 'classic' };
  }
  const safe = (raw: string | undefined): string | null => {
    if (!raw) return null;
    try {
      const url = new URL(raw);
      if (url.hostname !== TEXTURE_HOST) return null;
      url.protocol = 'https:';
      return url.toString();
    } catch {
      return null;
    }
  };
  return {
    skinUrl: safe(payload.textures?.SKIN?.url),
    capeUrl: safe(payload.textures?.CAPE?.url),
    model: payload.textures?.SKIN?.metadata?.model === 'slim' ? 'slim' : 'classic',
  };
}

async function getJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
  if (response.status === 204 || response.status === 404) return null;
  if (!response.ok) throw new Error(`Mojang ${response.status}`);
  return (await response.json()) as T;
}

async function getTexture(url: string): Promise<Buffer | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) return null;
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_TEXTURE_BYTES) return null;
  const data = Buffer.from(await response.arrayBuffer());
  return data.length <= MAX_TEXTURE_BYTES ? data : null;
}

export class MojangSkinSource implements SkinSource {
  async fetchByName(name: string): Promise<SkinTextures | null> {
    const profile = await getJson<{ id?: string }>(
      `https://api.minecraftservices.com/minecraft/profile/lookup/name/${encodeURIComponent(name)}`,
    );
    if (!profile?.id || !/^[0-9a-f]{32}$/i.test(profile.id)) return null;
    const session = await getJson<{
      properties?: { name: string; value: string }[];
    }>(`https://sessionserver.mojang.com/session/minecraft/profile/${profile.id}`);
    const property = session?.properties?.find((item) => item.name === 'textures');
    if (!property) return null;
    const parsed = parseTexturesProperty(property.value);
    if (!parsed.skinUrl) return null;
    const [skin, cape] = await Promise.all([
      getTexture(parsed.skinUrl),
      parsed.capeUrl ? getTexture(parsed.capeUrl) : Promise.resolve(null),
    ]);
    if (!skin || !isSkinPng(skin)) return null;
    return {
      model: parsed.model,
      skin,
      cape: cape && isCapePng(cape) ? cape : null,
    };
  }
}
