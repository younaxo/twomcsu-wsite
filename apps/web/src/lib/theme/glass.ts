/// Режим стеклянных материалов (см. globals.css, GLASS MATERIALS).
/// Выбирается один раз на клиенте и пишется на <html data-glass="…">:
/// компоненты про него не знают — CSS сам выбирает слой.
export type GlassMode = 'solid' | 'frosted' | 'liquid';

export const GLASS_ATTRIBUTE = 'data-glass';
export const GLASS_FILTER_ID = 'twomc-glass-refraction';

export interface GlassEnvironment {
  backdropFilter: boolean;
  svgBackdropFilter: boolean;
  reducedTransparency: boolean;
  reducedMotion: boolean;
  coarsePointer: boolean;
  /// navigator.deviceMemory (ГБ), undefined где не поддерживается.
  deviceMemory: number | undefined;
  saveData: boolean;
  /// Safari и Firefox не применяют url() в backdrop-filter (или применяют
  /// с артефактами) — для них максимум frosted.
  engine: 'blink' | 'webkit' | 'gecko' | 'unknown';
}

export function detectGlassEnvironment(): GlassEnvironment {
  const ua = navigator.userAgent;
  const isGecko = /Gecko\/\d/.test(ua) && !/like Gecko/.test(ua);
  const isBlink = /Chrome|Chromium|CriOS|Edg/.test(ua);
  const isWebKit = /AppleWebKit/.test(ua) && !isBlink;
  const engine = isGecko ? 'gecko' : isWebKit ? 'webkit' : isBlink ? 'blink' : 'unknown';
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  const supports = (prop: string, value: string) =>
    typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports(prop, value);
  const media = (query: string) =>
    typeof matchMedia === 'function' ? matchMedia(query).matches : false;
  return {
    backdropFilter:
      supports('backdrop-filter', 'blur(1px)') || supports('-webkit-backdrop-filter', 'blur(1px)'),
    svgBackdropFilter: supports('backdrop-filter', 'url(#x) blur(1px)'),
    reducedTransparency: media('(prefers-reduced-transparency: reduce)'),
    reducedMotion: media('(prefers-reduced-motion: reduce)'),
    coarsePointer: media('(pointer: coarse)'),
    deviceMemory: nav.deviceMemory,
    saveData: nav.connection?.saveData === true,
    engine,
  };
}

/// Правило выбора: solid — когда прозрачность нежелательна или невозможна;
/// liquid — только Blink на устройстве с запасом (≥ 4 ГБ, мышь, без
/// reduced-motion); иначе frosted.
export function resolveGlassMode(env: GlassEnvironment): GlassMode {
  if (!env.backdropFilter || env.reducedTransparency || env.saveData) {
    return 'solid';
  }
  const lowMemory = env.deviceMemory !== undefined && env.deviceMemory < 4;
  if (
    env.engine !== 'blink' ||
    !env.svgBackdropFilter ||
    env.reducedMotion ||
    env.coarsePointer ||
    lowMemory
  ) {
    return 'frosted';
  }
  return 'liquid';
}
