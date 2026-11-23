/// Соцсети страницы розыгрыша (футер в режиме GIVEAWAY_ONLY): единственное место,
/// где задаются адреса. Источник — env NEXT_PUBLIC_GIVEAWAY_SOCIAL_*; по умолчанию
/// пусто, и тогда иконка показывается неактивной («Скоро»). Адреса в компонентах
/// не хардкодятся. Обращения к process.env — литеральные, чтобы Next встроил их в сборку.
import type { SiteSocialPlatform } from '@twomc/shared';

export type GiveawaySocialPlatform = Extract<
  SiteSocialPlatform,
  'telegram' | 'discord' | 'youtube' | 'tiktok' | 'vk'
>;

export interface GiveawaySocialLink {
  platform: GiveawaySocialPlatform;
  label: string;
  /// null - адрес не задан: иконка неактивна.
  url: string | null;
}

function clean(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

export function getGiveawaySocialLinks(): GiveawaySocialLink[] {
  return [
    {
      platform: 'telegram',
      label: 'Telegram',
      url: clean(process.env.NEXT_PUBLIC_GIVEAWAY_SOCIAL_TELEGRAM),
    },
    {
      platform: 'discord',
      label: 'Discord',
      url: clean(process.env.NEXT_PUBLIC_GIVEAWAY_SOCIAL_DISCORD),
    },
    {
      platform: 'youtube',
      label: 'YouTube',
      url: clean(process.env.NEXT_PUBLIC_GIVEAWAY_SOCIAL_YOUTUBE),
    },
    {
      platform: 'tiktok',
      label: 'TikTok',
      url: clean(process.env.NEXT_PUBLIC_GIVEAWAY_SOCIAL_TIKTOK),
    },
    {
      platform: 'vk',
      label: 'ВКонтакте',
      url: clean(process.env.NEXT_PUBLIC_GIVEAWAY_SOCIAL_VK),
    },
  ];
}
