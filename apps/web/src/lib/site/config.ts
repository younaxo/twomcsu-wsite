import type { PublicSiteSettings, SiteSocialPlatform } from '@twomc/shared';
import { cdnUrl } from '../env';
import type { FlagCode } from '@/components/ui/flag-icon';

/// Единый источник глобального содержимого shell (sidebar, header, footer,
/// главная, metadata): название, логотип, навигация, соцсети, поддержка,
/// правовые ссылки, способы оплаты, версия. Динамическая часть (соцсети,
/// e-mail) приходит из `GET /site/settings` и редактируется в /admin/settings;
/// env — fallback.
///
/// Название сайта в UI — всегда «twomc.su» (не TwoMC).

export const SITE_NAME = 'twomc.su';
export const SITE_DESCRIPTION =
  'Minecraft-проект с собственными серверами, уникальными механиками, магазином и живым сообществом.';
export const SITE_LOGO_URL = cdnUrl('assets/images/logo.png');

/// Адрес для подключения в игре (показывается в hero, быстром старте, CTA).
export const SERVER_ADDRESS = process.env.NEXT_PUBLIC_SERVER_ADDRESS || 'play.twomc.su';
/// Поддерживаемые версии Minecraft (владелец): показываются один раз — в hero.
export const SUPPORTED_VERSIONS = process.env.NEXT_PUBLIC_MC_VERSIONS || '1.21.4 — 1.21.11';

/// Промокод для нового игрока (блок «Как играть»). Награда не обещается:
/// размер скидки/бонуса определяет backend (PromoCode) при применении.
export const PROMO_START = {
  code: 'START',
  title: 'Промокод для старта',
  hint: 'Введите код в поле «Промокод» при оформлении заказа в магазине.',
} as const;

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
export const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? '';

/// Юридическое/информационное примечание (footer). Слова «политике Mojang AB» —
/// внешняя ссылка на документ.
export const MOJANG_POLICY_URL = 'https://reallyworld.ru/mojang.pdf';
export const MOJANG_DISCLAIMER = {
  before:
    'twomc.su не связан с Mojang AB. Все средства идут на развитие проекта. Коммерческая деятельность проекта соответствует ',
  link: 'политике Mojang AB',
  after: '.',
} as const;

export type SiteIconName =
  | 'home'
  | 'shop'
  | 'rules'
  | 'servers'
  | 'news'
  | 'gift'
  | 'telegram'
  | 'discord'
  | 'tiktok'
  | 'vk'
  | 'youtube';

export interface SiteNavItem {
  href: string;
  label: string;
  icon: SiteIconName;
  /// Точное совпадение пути (главная); иначе активен префикс.
  exact?: boolean;
  /// Показывать в центре header.
  header?: boolean;
}

/// Только реально существующие маршруты (PHASE 31 добавит остальные).
export const SITE_NAVIGATION: SiteNavItem[] = [
  { href: '/', label: 'Главная', icon: 'home', exact: true },
  { href: '/shop', label: 'Магазин', icon: 'shop', header: true },
  { href: '/rules', label: 'Правила', icon: 'rules', header: true },
  { href: '/servers', label: 'Сервера', icon: 'servers', header: true },
];

export const BONUS_LINK = { href: '/shop#bonus', label: 'Бонусы', icon: 'gift' as const };

/// Соцсети проекта (ADR-0067). Источник — список из админки
/// (`PublicSiteSettings.socialLinks`, только включённые, по порядку);
/// для основных платформ — fallback на env, пока ссылка не задана в админке.
export interface SocialLink {
  /// Уникальный ключ строки (id записи или платформа для env/плейсхолдера).
  key: string;
  platform: SiteSocialPlatform;
  label: string;
  url: string;
}

export const SOCIAL_PLATFORM_LABELS: Record<SiteSocialPlatform, string> = {
  telegram: 'Telegram',
  discord: 'Discord',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  vk: 'VK',
  twitch: 'Twitch',
  instagram: 'Instagram',
  x: 'X',
  facebook: 'Facebook',
};

/// Основные сообщества: в футере видны всегда (без ссылки — «скоро»).
export const CORE_SOCIAL_PLATFORMS: SiteSocialPlatform[] = [
  'telegram',
  'discord',
  'youtube',
  'tiktok',
  'vk',
];

const SOCIAL_ENV: Partial<Record<SiteSocialPlatform, string | undefined>> = {
  telegram: process.env.NEXT_PUBLIC_TELEGRAM_URL,
  discord: process.env.NEXT_PUBLIC_DISCORD_URL,
  youtube: process.env.NEXT_PUBLIC_YOUTUBE_URL,
  tiktok: process.env.NEXT_PUBLIC_TIKTOK_URL,
  vk: process.env.NEXT_PUBLIC_VK_URL,
};

export interface SocialSlot extends Omit<SocialLink, 'url'> {
  /// null — ссылка ещё не задана: слот показывается недоступным.
  url: string | null;
}

const isHttps = (value: string | null | undefined): value is string =>
  !!value && /^https:\/\//.test(value);

/// Только соцсети с реальной ссылкой (rail, «Сообщество»): список из админки
/// по порядку; основные платформы без записи — из env.
export function resolveSocialLinks(settings: PublicSiteSettings | null | undefined): SocialLink[] {
  const fromAdmin: SocialLink[] = (settings?.socialLinks ?? [])
    .filter((link) => isHttps(link.url))
    .map((link) => ({
      key: link.id,
      platform: link.platform,
      label: link.title || SOCIAL_PLATFORM_LABELS[link.platform],
      url: link.url,
    }));
  const present = new Set(fromAdmin.map((link) => link.platform));
  const fromEnv: SocialLink[] = CORE_SOCIAL_PLATFORMS.filter(
    (platform) => !present.has(platform) && isHttps(SOCIAL_ENV[platform]),
  ).map((platform) => ({
    key: `env-${platform}`,
    platform,
    label: SOCIAL_PLATFORM_LABELS[platform],
    url: SOCIAL_ENV[platform] as string,
  }));
  return [...fromAdmin, ...fromEnv];
}

/// Футер: все подключённые соцсети + плейсхолдеры «скоро» для основных
/// платформ, которых ещё нет (одинаковые по размеру иконки).
export function resolveSocialSlots(settings: PublicSiteSettings | null | undefined): SocialSlot[] {
  const links = resolveSocialLinks(settings);
  const present = new Set(links.map((link) => link.platform));
  const placeholders: SocialSlot[] = CORE_SOCIAL_PLATFORMS.filter(
    (platform) => !present.has(platform),
  ).map((platform) => ({
    key: `slot-${platform}`,
    platform,
    label: SOCIAL_PLATFORM_LABELS[platform],
    url: null,
  }));
  return [...links, ...placeholders];
}

/// Поддержка: e-mail из настроек сайта → env → официальный адрес владельца;
/// административный e-mail и Telegram поддержки — из конфига владельца.
export const SUPPORT = {
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@twomc.su',
  adminEmail: process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'admin@twomc.su',
  telegram: {
    handle: '@twomcsu_support',
    url: 'https://t.me/twomcsu_support',
  },
} as const;

export function resolveSupportEmail(settings: PublicSiteSettings | null | undefined): string {
  return settings?.contactEmail || SUPPORT.email;
}

/// Публичная status page (отдельный проект twomcsu-statuspagewebsite,
/// https://status.twomc.su); переопределяется NEXT_PUBLIC_STATUS_PAGE_URL.
export const STATUS_PAGE_URL = process.env.NEXT_PUBLIC_STATUS_PAGE_URL || 'https://status.twomc.su';

export interface FooterLink {
  href: string;
  label: string;
  external?: boolean;
  /// Документ/страница ещё не существует — показывается как недоступная.
  available: boolean;
}

export const FOOTER_PLAYER_LINKS: FooterLink[] = [
  { href: '/#quick-start', label: 'Начать играть', available: true },
  { href: '/shop', label: 'Магазин', available: true },
  { href: '/servers', label: 'Серверы', available: true },
  { href: '/rules', label: 'Правила', available: true },
  { href: '/wiki', label: 'Wiki', available: false },
  { href: '/news', label: 'Новости', available: false },
];

/// Правовые документы: маршруты зафиксированы, тексты — отдельное ТЗ
/// (RISKS R15). Недоступные показываются без ссылки; политика Mojang AB —
/// внешний документ.
export const FOOTER_LEGAL_LINKS: FooterLink[] = [
  { href: '/legal/privacy', label: 'Политика конфиденциальности', available: true },
  { href: '/legal/terms', label: 'Пользовательское соглашение', available: true },
  { href: '/legal/cookies', label: 'Политика Cookie', available: true },
  { href: '/legal/info', label: 'Юридическая информация', available: true },
  { href: '/legal/refunds', label: 'Политика возвратов', available: true },
  { href: MOJANG_POLICY_URL, label: 'Политика Mojang AB', external: true, available: true },
];

/// Юридические данные владельца. Значения предоставлены владельцем (ФИО, ИНН)
/// и используются буквально. Владелец — самозанятый (плательщик НПД):
/// ОГРНИП/ИП/ООО не указываются и не выдумываются; адрес — только из env.
export const LEGAL_OWNER = {
  name: process.env.NEXT_PUBLIC_LEGAL_NAME || 'Кирилл Алексеевич Баранов',
  inn: process.env.NEXT_PUBLIC_LEGAL_INN || '230815487140',
  status: process.env.NEXT_PUBLIC_LEGAL_STATUS || 'Самозанятый (плательщик НПД)',
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || null,
};

export interface PaymentMethod {
  id: 'visa' | 'mastercard' | 'mir' | 'sbp';
  label: string;
  /// Локальный SVG-ассет (предоставлен владельцем, оптимизирован SVGO; не перерисовывать).
  src: string;
  width: number;
  height: number;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'visa', label: 'Visa', src: '/assets/payment/visa.svg', width: 48, height: 32 },
  {
    id: 'mastercard',
    label: 'Mastercard',
    src: '/assets/payment/mastercard.svg',
    width: 48,
    height: 32,
  },
  { id: 'mir', label: 'МИР', src: '/assets/payment/mir.svg', width: 48, height: 32 },
  { id: 'sbp', label: 'СБП', src: '/assets/payment/sbp.svg', width: 48, height: 32 },
];

/// Язык и валюта — две независимые настройки пользователя (см.
/// lib/site/preferences.ts). Варианты без поддержки на сервере показываются
/// как недоступные («скоро»), а не как рабочие.
export interface LocaleOption {
  code: 'ru' | 'en';
  label: string;
  /// SVG-флаг (`FlagIcon`, ADR-0085) — не emoji.
  flag: FlagCode;
  available: boolean;
}
export interface CurrencyOption {
  code: 'RUB' | 'USD' | 'EUR';
  label: string;
  symbol: string;
  available: boolean;
}

export const LOCALES: LocaleOption[] = [
  { code: 'ru', label: 'Русский', flag: 'ru', available: true },
  { code: 'en', label: 'English', flag: 'gb', available: false },
];
export const CURRENCIES: CurrencyOption[] = [
  { code: 'RUB', label: 'Российский рубль', symbol: '₽', available: true },
  { code: 'USD', label: 'Доллар США', symbol: '$', available: false },
  { code: 'EUR', label: 'Евро', symbol: '€', available: false },
];

/// Showcase возможностей проекта на главной: 1 крупный + 3 дополнительных.
/// Изображения — только реальные превью владельца (CDN); без них карточка
/// рисуется без картинки, фейковые скриншоты не подставляются.
export interface HomeFeature {
  id: string;
  title: string;
  description: string;
  image?: string | null;
  size: 'large' | 'small';
}

export const HOME_FEATURES: HomeFeature[] = [
  {
    id: 'casino',
    title: '3D-казино',
    description:
      'Настоящее казино прямо на сервере: рулетка, слоты и столы с объёмными моделями, ставки игровой валютой.',
    image: process.env.NEXT_PUBLIC_HOME_FEATURE_CASINO || null,
    size: 'large',
  },
  {
    id: 'events',
    title: 'Кинематографические ивенты',
    description: 'Сюжетные события с озвучкой, катсценами и наградами для всех участников.',
    image: process.env.NEXT_PUBLIC_HOME_FEATURE_EVENTS || null,
    size: 'small',
  },
  {
    id: 'duels',
    title: 'Дуэли и сферы',
    description: 'Арены 1 на 1, рейтинг и сферы с уникальными способностями.',
    image: process.env.NEXT_PUBLIC_HOME_FEATURE_DUELS || null,
    size: 'small',
  },
  {
    id: 'items',
    title: 'Талисманы и особые предметы',
    description:
      'Собственные механики предметов: талисманы, артефакты и крафты, которых нет в ванили.',
    image: process.env.NEXT_PUBLIC_HOME_FEATURE_ITEMS || null,
    size: 'small',
  },
];

/// Сильные изображения hero (скриншоты проекта) — только реальные ассеты
/// владельца через env (относительные пути CDN через запятую).
export const HOME_HERO_IMAGES: string[] = (process.env.NEXT_PUBLIC_HOME_HERO_IMAGES || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => (/^https?:\/\//.test(value) ? value : cdnUrl(value)));

export function isSiteNavActive(item: SiteNavItem, pathname: string): boolean {
  if (item.exact) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
