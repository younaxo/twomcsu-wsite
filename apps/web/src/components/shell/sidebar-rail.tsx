'use client';

import {
  BookOpen,
  Gift,
  Home,
  Newspaper,
  Server,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { formatNumber, plural } from '@/lib/format';
import {
  BONUS_LINK,
  isSiteNavActive,
  resolveSocialLinks,
  SITE_NAVIGATION,
  type SiteIconName,
  type SocialLink,
} from '@/lib/site/config';
import { usePublicSiteSettings, useServersOverview } from '@/lib/site/hooks';
import { BrandIcon } from './brand-icon';
import { LocalePopover } from './locale-popover';

export const RAIL_WIDTH_CLASS = 'w-16';
/// Отступ контента под фиксированный rail (desktop).
export const RAIL_OFFSET_CLASS = 'lg:pl-16';

const ICONS: Record<Exclude<SiteIconName, SocialLink['platform']>, LucideIcon> = {
  home: Home,
  shop: ShoppingBag,
  rules: BookOpen,
  servers: Server,
  news: Newspaper,
  gift: Gift,
};

const itemClassName = cn(
  'relative flex size-10 items-center justify-center rounded text-muted-foreground',
  'transition-colors duration-fast hover:bg-muted hover:text-foreground',
  '[&_svg]:size-5 [&_svg]:shrink-0',
);

const activeClassName = cn(
  'bg-primary-soft text-primary shadow-sm hover:bg-primary-soft hover:text-primary',
  'before:absolute before:-left-3 before:top-1/2 before:h-6 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-primary',
);

/// Общий онлайн всех серверов — реальный ping (GET /servers/overview).
/// Пока данных нет — скелетон; при ошибке — «—» без выдуманных чисел.
export function OnlineCounter({ compact = false }: { compact?: boolean }) {
  const overview = useServersOverview();
  const players = overview.data?.totalPlayers;
  const online = (overview.data?.onlineServers ?? 0) > 0;
  const label =
    players === undefined
      ? overview.isError
        ? 'Онлайн недоступен'
        : 'Загружаем онлайн'
      : `Общий онлайн: ${formatNumber(players)} ${plural(players, { one: 'игрок', few: 'игрока', many: 'игроков' })}`;
  return (
    <Tooltip content={label} side={compact ? 'bottom' : 'right'}>
      <Link
        href="/servers"
        aria-label={label}
        data-testid="online-counter"
        className={cn(
          'flex flex-col items-center gap-0.5 rounded px-1 py-2 text-foreground hover:bg-muted',
          compact && 'flex-row gap-2 px-2 py-1',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'size-2 rounded-full',
            online ? 'bg-success' : overview.isPending ? 'bg-border-strong' : 'bg-destructive',
          )}
        />
        {overview.isPending ? (
          <Skeleton className="h-4 w-8" />
        ) : (
          <span className="font-display text-xs font-bold tabular">
            {players === undefined ? '—' : formatNumber(players)}
          </span>
        )}
      </Link>
    </Tooltip>
  );
}

function RailLink({
  href,
  label,
  icon,
  active,
  external = false,
  emphasis = false,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  external?: boolean;
  emphasis?: boolean;
}) {
  const className = cn(itemClassName, active && activeClassName, emphasis && 'text-primary');
  return (
    <Tooltip content={label} side="right">
      {external ? (
        <a
          href={href}
          aria-label={label}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
        >
          {icon}
        </a>
      ) : (
        <Link
          href={href}
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          className={className}
        >
          {icon}
        </Link>
      )}
    </Tooltip>
  );
}

/// Фиксированный navigation rail слева (desktop): только иконки, подписи —
/// Tooltip справа, без collapse/expand и изменения ширины. Без рамки: цвет почти
/// как фон страницы (часть общего canvas), активный пункт — оранжевый акцент
/// на приподнятой подложке. Сверху — общий
/// онлайн, затем разделы сайта, снизу — бонусы, соцсети, язык/валюта.
export function SidebarRail({ className }: { className?: string }) {
  const pathname = usePathname();
  const settings = usePublicSiteSettings();
  const socials = resolveSocialLinks(settings.data);
  const Bonus = ICONS[BONUS_LINK.icon];

  return (
    <aside
      data-testid="sidebar-rail"
      className={cn(
        'fixed inset-y-0 left-0 z-sidebar hidden flex-col items-center bg-background-subtle py-3 lg:flex',
        RAIL_WIDTH_CLASS,
        className,
      )}
    >
      <OnlineCounter />
      <nav aria-label="Разделы сайта" className="mt-3 flex flex-col items-center gap-1">
        {SITE_NAVIGATION.map((item) => {
          const Icon = ICONS[item.icon as keyof typeof ICONS];
          return (
            <RailLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={<Icon aria-hidden />}
              active={isSiteNavActive(item, pathname)}
            />
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col items-center gap-1">
        <RailLink
          href={BONUS_LINK.href}
          label={BONUS_LINK.label}
          icon={<Bonus aria-hidden />}
          emphasis
        />
        {socials.length > 0 ? (
          <nav
            aria-label="Соцсети"
            className="mt-1 flex flex-col items-center gap-1 border-t border-border-subtle pt-2"
          >
            {socials.map((social) => (
              <RailLink
                key={social.key}
                href={social.url}
                label={social.label}
                icon={<BrandIcon id={social.platform} className="size-[18px]" />}
                external
              />
            ))}
          </nav>
        ) : null}
        <LocalePopover className="mt-1" />
      </div>
    </aside>
  );
}
