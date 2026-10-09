'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { NavigationMenu } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useIsMobile } from '@/lib/use-media-query';

export interface MegaMenuLink {
  label: ReactNode;
  href: string;
  description?: ReactNode;
  icon?: ReactNode;
}

export interface MegaMenuGroup {
  title: ReactNode;
  links: MegaMenuLink[];
}

export interface MegaMenuSection {
  id: string;
  label: ReactNode;
  /// Прямая ссылка без панели (если нет `groups`).
  href?: string;
  /// Группы ссылок в панели — колонки сетки.
  groups?: MegaMenuGroup[];
}

export interface MegaMenuProps {
  sections: MegaMenuSection[];
  /// Доступное имя навигации.
  label?: string;
  className?: string;
}

const triggerClassName = cn(
  'group inline-flex h-control-sm select-none items-center gap-1 whitespace-nowrap rounded px-3 text-sm font-medium text-foreground',
  'transition-colors duration-fast hover:bg-muted data-[state=open]:bg-muted',
  '[&_svg]:size-4 [&_svg]:shrink-0',
);

const GRID_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

function MegaMenuLinkItem({ link, inRadix }: { link: MegaMenuLink; inRadix: boolean }) {
  const anchor = (
    <Link
      href={link.href}
      className={cn(
        'flex gap-2.5 rounded px-3 py-2 transition-colors duration-fast hover:bg-muted focus-visible:bg-muted',
        '[&_svg]:size-4 [&_svg]:shrink-0',
      )}
    >
      {link.icon ? (
        <span aria-hidden className="mt-0.5 inline-flex text-muted-foreground">
          {link.icon}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium leading-tight">{link.label}</span>
        {link.description ? (
          <span className="text-xs leading-snug text-muted-foreground">{link.description}</span>
        ) : null}
      </span>
    </Link>
  );
  return inRadix ? <NavigationMenu.Link asChild>{anchor}</NavigationMenu.Link> : anchor;
}

function MegaMenuGroups({ groups, inRadix }: { groups: MegaMenuGroup[]; inRadix: boolean }) {
  return (
    <>
      {groups.map((group, groupIndex) => (
        <div key={groupIndex} className="min-w-0">
          <p className="mb-1 px-3 text-xs font-medium text-subtle-foreground">{group.title}</p>
          <ul className="flex flex-col gap-0.5">
            {group.links.map((link) => (
              <li key={link.href}>
                <MegaMenuLinkItem link={link} inRadix={inRadix} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

/// MegaMenu — публичная навигация «Разделы»: триггеры разделов и панель-сетка
/// групп ссылок на всю ширину контейнера (Radix NavigationMenu). На mobile —
/// аккордеон на нативных `<details>` без Radix.
export function MegaMenu({ sections, label = 'Разделы сайта', className }: MegaMenuProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <nav
        aria-label={label}
        className={cn('flex flex-col divide-y divide-border-subtle', className)}
      >
        {sections.map((section) =>
          section.groups && section.groups.length > 0 ? (
            <details key={section.id} className="group">
              <summary
                className={cn(
                  'flex h-row cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-medium',
                  'rounded-sm hover:bg-muted [&::-webkit-details-marker]:hidden',
                )}
              >
                <span>{section.label}</span>
                <ChevronDown
                  aria-hidden
                  className="size-4 shrink-0 text-subtle-foreground transition-transform duration-fast group-open:rotate-180"
                />
              </summary>
              <div className="flex flex-col gap-4 px-1 pb-4">
                <MegaMenuGroups groups={section.groups} inRadix={false} />
              </div>
            </details>
          ) : section.href ? (
            <Link
              key={section.id}
              href={section.href}
              className="flex h-row items-center rounded-sm px-3 text-sm font-medium hover:bg-muted"
            >
              {section.label}
            </Link>
          ) : (
            <span
              key={section.id}
              className="flex h-row items-center px-3 text-sm font-medium text-muted-foreground"
            >
              {section.label}
            </span>
          ),
        )}
      </nav>
    );
  }

  return (
    <NavigationMenu.Root aria-label={label} className={cn('relative z-40 w-full', className)}>
      <NavigationMenu.List className="flex items-center gap-1">
        {sections.map((section) =>
          section.groups && section.groups.length > 0 ? (
            <NavigationMenu.Item key={section.id}>
              <NavigationMenu.Trigger className={triggerClassName}>
                {section.label}
                <ChevronDown
                  aria-hidden
                  className="text-subtle-foreground transition-transform duration-fast group-data-[state=open]:rotate-180"
                />
              </NavigationMenu.Trigger>
              <NavigationMenu.Content
                className={cn(
                  'w-full p-card-p',
                  'data-[motion^=from-]:animate-fade-in data-[motion^=to-]:animate-fade-out',
                )}
              >
                <div
                  className={cn(
                    'grid gap-gap',
                    GRID_COLS[Math.min(section.groups.length, 4)] ?? 'grid-cols-4',
                  )}
                >
                  <MegaMenuGroups groups={section.groups} inRadix />
                </div>
              </NavigationMenu.Content>
            </NavigationMenu.Item>
          ) : (
            <NavigationMenu.Item key={section.id}>
              {section.href ? (
                <NavigationMenu.Link asChild>
                  <Link href={section.href} className={triggerClassName}>
                    {section.label}
                  </Link>
                </NavigationMenu.Link>
              ) : (
                <span
                  className={cn(triggerClassName, 'text-muted-foreground hover:bg-transparent')}
                >
                  {section.label}
                </span>
              )}
            </NavigationMenu.Item>
          ),
        )}
      </NavigationMenu.List>

      {/* Панель на всю ширину контейнера; высота анимируется Radix через CSS-переменную. */}
      <div className="absolute left-0 top-full flex w-full justify-center">
        <NavigationMenu.Viewport
          className={cn(
            'relative mt-2 h-[var(--radix-navigation-menu-viewport-height)] w-full overflow-hidden',
            'rounded-lg border bg-surface-overlay text-foreground shadow-lg edge-highlight',
            'transition-[height]',
            'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out [--pop-y:-6px]',
          )}
        />
      </div>
    </NavigationMenu.Root>
  );
}
