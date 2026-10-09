import type { PublicSiteSettings } from '@twomc/shared';
import { cdnUrl } from '../env';

/// Единый источник глобального содержимого shell (sidebar, header, footer,
/// metadata): название, логотип, навигация, соцсети, правовые ссылки,
/// способы оплаты, версия. Динамическая часть (соцсети, e-mail) приходит
/// из `GET /site/settings` и редактируется в /admin/settings; env — fallback.
///
/// Название сайта в UI — всегда «twomc.su» (не TwoMC).

export const SITE_NAME = 'twomc.su';
export const SITE_TAGLINE = 'New-Era Anarchy';
export const SITE_LOGO_URL = cdnUrl('assets/images/logo.png');

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
export const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? '';

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

export interface SocialLink {
  id: 'telegram' | 'discord' | 'tiktok' | 'vk' | 'youtube';
  label: string;
  url: string;
}

const SOCIAL_LABELS: Record<SocialLink['id'], string> = {
  telegram: 'Telegram',
  discord: 'Discord',
  tiktok: 'TikTok',
  vk: 'VK',
  youtube: 'YouTube',
};

/// Соцсети: из настроек сайта (backend), затем из env. Пустые — не показываются.
/// TikTok в SiteSettings нет — только env NEXT_PUBLIC_TIKTOK_URL.
export function resolveSocialLinks(settings: PublicSiteSettings | null | undefined): SocialLink[] {
  const raw: Record<SocialLink['id'], string | null | undefined> = {
    telegram: settings?.socials.telegram || process.env.NEXT_PUBLIC_TELEGRAM_URL,
    discord: settings?.socials.discord || process.env.NEXT_PUBLIC_DISCORD_URL,
    tiktok: process.env.NEXT_PUBLIC_TIKTOK_URL,
    vk: settings?.socials.vk || process.env.NEXT_PUBLIC_VK_URL,
    youtube: settings?.socials.youtube || process.env.NEXT_PUBLIC_YOUTUBE_URL,
  };
  const order: SocialLink['id'][] = ['telegram', 'discord', 'tiktok', 'vk', 'youtube'];
  return order
    .filter((id) => raw[id] && /^https?:\/\//.test(raw[id] as string))
    .map((id) => ({ id, label: SOCIAL_LABELS[id], url: raw[id] as string }));
}

export function resolveSupportEmail(
  settings: PublicSiteSettings | null | undefined,
): string | null {
  return settings?.contactEmail || process.env.NEXT_PUBLIC_SUPPORT_EMAIL || null;
}

/// Публичная status page (отдельный проект twomcsu-statuspagewebsite);
/// пока URL не задан — внутренний маршрут /status.
export const STATUS_PAGE_URL = process.env.NEXT_PUBLIC_STATUS_PAGE_URL || '/status';

export interface FooterLink {
  href: string;
  label: string;
  external?: boolean;
  /// Документ/страница ещё не существует — показывается как недоступная.
  available: boolean;
}

export const FOOTER_PLAYER_LINKS: FooterLink[] = [
  { href: '/servers', label: 'Начать играть', available: true },
  { href: '/shop', label: 'Магазин', available: true },
  { href: '/servers', label: 'Серверы', available: true },
  { href: '/rules', label: 'Правила игры', available: true },
  { href: '/rules#forum', label: 'Правила форума', available: false },
  { href: '/wiki', label: 'Wiki', available: false },
];

/// Правовые документы: маршруты зафиксированы, тексты — отдельное ТЗ
/// (RISKS: нет юридических данных). Недоступные показываются без ссылки.
export const FOOTER_LEGAL_LINKS: FooterLink[] = [
  { href: '/legal/privacy', label: 'Политика конфиденциальности', available: false },
  { href: '/legal/terms', label: 'Пользовательское соглашение', available: false },
  { href: '/legal/cookies', label: 'Политика использования Cookie', available: false },
  { href: '/legal/info', label: 'Юридическая информация', available: false },
  { href: '/legal/refunds', label: 'Политика возвратов', available: false },
];

/// Юридические данные владельца — только из env production (не выдумывать).
export const LEGAL_OWNER = {
  name: process.env.NEXT_PUBLIC_LEGAL_NAME || null,
  inn: process.env.NEXT_PUBLIC_LEGAL_INN || null,
  ogrnip: process.env.NEXT_PUBLIC_LEGAL_OGRNIP || null,
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || null,
};

export interface PaymentMethod {
  id: 'visa' | 'mastercard' | 'mir' | 'sbp';
  label: string;
  /// Локальный SVG-ассет (предоставлен владельцем; не перерисовывать).
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

/// Поддерживаемые локали/валюты: пока только русский и рубль (других в
/// backend нет — не показываем несуществующие как рабочие).
export const LOCALES = [{ code: 'ru', label: 'Русский', flag: '🇷🇺' }] as const;
export const CURRENCIES = [{ code: 'RUB', label: 'Рубль', symbol: '₽' }] as const;

export function isSiteNavActive(item: SiteNavItem, pathname: string): boolean {
  if (item.exact) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
