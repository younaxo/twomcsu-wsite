import { CDN_BASE_URL } from '@/lib/env';

/// Реальные скриншоты сервера TwoMC (D3, ADR-0096) — единственный источник
/// изображений проекта для сайта: Auth-карусель, hero, showcase, галерея.
/// Компоненты берут кадры только отсюда, URL по JSX не разбрасываются.
///
/// Файлы на CDN: `assets/images/screenshots/<id>/<ширина>.<avif|webp>` +
/// `original.png` (исходник без изменений). Ширины не больше исходной 1920
/// (без upscale). `NEXT_PUBLIC_SCREENSHOTS_BASE_URL` переопределяет базу (для
/// локальной проверки, когда CDN недоступен из среды разработки).

export const SCREENSHOT_WIDTHS = [640, 960, 1280, 1600, 1920] as const;
export type ScreenshotWidth = (typeof SCREENSHOT_WIDTHS)[number];
export type ScreenshotFormat = 'avif' | 'webp';

export const SCREENSHOTS_BASE_URL = (
  process.env.NEXT_PUBLIC_SCREENSHOTS_BASE_URL || `${CDN_BASE_URL}/assets/images/screenshots`
).replace(/\/+$/, '');

export type ScreenshotCategory = 'spawn' | 'casino' | 'landscape' | 'building';

export interface ProjectScreenshot {
  /// Стабильный slug — он же каталог на CDN.
  id: string;
  title: string;
  /// Короткое описание — только то, что реально видно на кадре.
  description: string;
  /// Текст для screen reader: что изображено.
  alt: string;
  category: ScreenshotCategory;
  /// Порядок показа (1 — первым): сильный и понятный кадр — раньше.
  priority: number;
  width: number;
  height: number;
  /// Фокус кадрирования при object-cover (важная часть не обрезается).
  objectPosition: string;
  /// Исходный файл владельца (для истории, не для показа).
  source: string;
}

const SHOTS: ProjectScreenshot[] = [
  {
    id: 'spawn-day',
    title: 'Спавн TwoMC',
    description: 'Площадь с порталами, дома, озеро и горы — и надпись twomc.su прямо в небе.',
    alt: 'Дневной вид сверху на спавн TwoMC: центральная площадь с порталами, дома, горы, озеро и объёмная надпись twomc.su в небе',
    category: 'spawn',
    priority: 1,
    width: 1920,
    height: 1009,
    objectPosition: '50% 45%',
    source: '2026-10-10_13.29.55.png',
  },
  {
    id: '3d-casino',
    title: '3D-казино',
    description: 'Кастомное 3D-казино прямо на сервере: рулетка с крупье, слоты и бильярд.',
    alt: '3D-казино на сервере TwoMC: столы рулетки с крупье, игровые автоматы, бильярдные столы и голограммы «Рулетка» и «Бильярд»',
    category: 'casino',
    priority: 2,
    width: 1920,
    height: 1009,
    objectPosition: '50% 55%',
    source: '2026-10-10_13.28.43.png',
  },
  {
    id: 'spawn-town',
    title: 'Город на спавне',
    description: 'Дома под черепицей, рыночная лавка и круглая площадь у подножия острых гор.',
    alt: 'Вид сверху на город спавна: дома с красными крышами, лавка с полосатым навесом, белая круглая площадь и скалистые горы',
    category: 'spawn',
    priority: 3,
    width: 1920,
    height: 1009,
    objectPosition: '50% 50%',
    source: '2026-10-10_13.30.08.png',
  },
  {
    id: 'spawn-hall',
    title: 'Здание «Открытие TwoMC»',
    description: 'Большое здание у мощёной дороги с баннером «Открытие TwoMC» на фасаде.',
    alt: 'Большое фахверковое здание с жёлтыми крышами и баннером «Открытие TwoMC» над входом, мощёная дорога и деревья',
    category: 'building',
    priority: 4,
    width: 1920,
    height: 1009,
    objectPosition: '50% 40%',
    source: '2026-10-10_13.36.18.png',
  },
  {
    id: 'amethyst-crater',
    title: 'Кратер с аметистами',
    description: 'Скалы с кристаллами аметиста, поток лавы и деревянные мостки внутри кратера.',
    alt: 'Вид внутрь каменного кратера: фиолетовые кристаллы аметиста, поток лавы и деревянные мостки вдоль стен',
    category: 'landscape',
    priority: 5,
    width: 1920,
    height: 1009,
    objectPosition: '50% 55%',
    source: '2026-10-10_13.30.33.png',
  },
  {
    id: 'spawn-night',
    title: 'Спавн ночью',
    description: 'Фонари вдоль дороги и светящаяся надпись twomc.su в ночном небе.',
    alt: 'Ночной спавн TwoMC: дорога с фонарями, деревья и светящаяся надпись twomc.su в небе',
    category: 'spawn',
    priority: 6,
    width: 1920,
    height: 1009,
    objectPosition: '50% 35%',
    source: '2026-10-10_13.28.19.png',
  },
  {
    id: 'spawn-night-plaza',
    title: 'Площадь ночью',
    description: 'Подсвеченная круглая площадь в центре спавна — вид сверху.',
    alt: 'Ночной вид сверху на подсвеченную круглую площадь в центре спавна, вокруг фонари и дорожки',
    category: 'spawn',
    priority: 7,
    width: 1920,
    height: 1009,
    objectPosition: '50% 55%',
    source: '2026-10-10_13.29.18.png',
  },
  {
    id: 'spawn-hills',
    title: 'Холмы у спавна',
    description: 'Зелёный холм с прудом у подножия острых гор — вид сверху.',
    alt: 'Вид сверху на зелёный холм с небольшим прудом рядом с высокими скалистыми горами',
    category: 'landscape',
    priority: 8,
    width: 1920,
    height: 1009,
    objectPosition: '50% 50%',
    source: '2026-10-10_13.30.12.png',
  },
];

export const PROJECT_SCREENSHOTS: readonly ProjectScreenshot[] = [...SHOTS].sort(
  (a, b) => a.priority - b.priority,
);

export function getScreenshot(id: string): ProjectScreenshot {
  const shot = PROJECT_SCREENSHOTS.find((item) => item.id === id);
  if (!shot) throw new Error(`Нет скриншота «${id}» в реестре`);
  return shot;
}

export function screenshotUrl(
  shot: Pick<ProjectScreenshot, 'id'>,
  width: ScreenshotWidth,
  format: ScreenshotFormat,
): string {
  return `${SCREENSHOTS_BASE_URL}/${shot.id}/${width}.${format}`;
}

/// srcset без upscale: только ширины не больше исходной.
export function screenshotSrcSet(shot: ProjectScreenshot, format: ScreenshotFormat): string {
  return SCREENSHOT_WIDTHS.filter((width) => width <= shot.width)
    .map((width) => `${screenshotUrl(shot, width, format)} ${width}w`)
    .join(', ');
}
