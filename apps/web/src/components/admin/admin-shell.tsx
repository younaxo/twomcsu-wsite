'use client';

import {
  Database,
  Download,
  Key,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  Newspaper,
  Power,
  Receipt,
  ScrollText,
  Search,
  Settings,
  Shield,
  Sparkles,
  type LucideIcon,
  UserRound,
  Users,
  Wrench,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { BrandWordmark } from '@/components/shell/brand-wordmark';
import { DocumentBadge } from '@/components/shell/document-badge';
import { ProfileTrigger } from '@/components/shell/profile-trigger';
import { Avatar } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  useCommandPalette,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { useLogoutConfirm } from '@/components/auth/logout-confirm';
import { UserIdentity } from '@/components/ui/user-identity';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Tooltip } from '@/components/ui/tooltip';
import {
  ADMIN_NAV,
  isNavItemActive,
  type AdminIconName,
  type AdminNavGroup,
  type AdminNavItem,
} from '@/lib/admin/navigation';
import { useAuthStore } from '@/lib/auth/store';
import { usePermissions } from '@/lib/auth/use-permissions';
import { cn } from '@/lib/cn';
import { pickPrimaryRole } from '@/lib/roles/primary-role';
import { SITE_LOGO_URL, SITE_NAME } from '@/lib/site/config';

const ICONS: Record<AdminIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  users: Users,
  shield: Shield,
  key: Key,
  scroll: ScrollText,
  megaphone: Megaphone,
  mail: Mail,
  power: Power,
  sparkles: Sparkles,
  database: Database,
  settings: Settings,
  lock: Lock,
  newspaper: Newspaper,
  receipt: Receipt,
  download: Download,
  wrench: Wrench,
};

/// Навигация, отфильтрованная по правам текущего пользователя. Группы без
/// видимых пунктов исчезают целиком.
function useVisibleNav(): AdminNavGroup[] {
  const { can, effective } = usePermissions();
  return useMemo(
    () =>
      ADMIN_NAV.map((group) => ({
        ...group,
        items: group.items.filter((item) => can(item.requirement)),
      })).filter((group) => group.items.length > 0),
    // `effective` — реальная зависимость (can пересоздаётся вместе с ним).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [can, effective],
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: AdminNavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = ICONS[item.icon];
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={cn(
        'flex h-10 items-center gap-3 rounded px-3 text-sm font-medium transition-colors duration-fast [&_svg]:size-4 [&_svg]:shrink-0',
        active
          ? 'bg-primary-soft text-primary-soft-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon aria-hidden />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </Link>
  );
}

function SidebarNav({ groups, onNavigate }: { groups: AdminNavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Разделы админ-панели" className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.id}>
          <p className="mb-1.5 px-3 text-xs font-medium text-subtle-foreground">{group.title}</p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.href}>
                <NavLink
                  item={item}
                  active={isNavItemActive(item, pathname)}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/// [LOGO] twomc.su / Админ-панель — основной логотип (не сезонный).
function Brand() {
  return (
    <Link
      href="/admin"
      aria-label={`${SITE_NAME} — Админ-панель`}
      className="flex min-w-0 items-center gap-2.5 rounded-sm"
    >
      <Image
        src={SITE_LOGO_URL}
        alt=""
        width={32}
        height={32}
        quality={90}
        priority
        draggable={false}
        className="shrink-0 select-none rounded-sm"
      />
      <span className="flex min-w-0 flex-col leading-none">
        <BrandWordmark size="md" />
        <span className="mt-0.5 text-xs text-muted-foreground">Админ-панель</span>
      </span>
    </Link>
  );
}

function Sidebar({ groups }: { groups: AdminNavGroup[] }) {
  return (
    // Плавающий остров (ADR-0078): отступ от краёв, скругление, тень — без рамок.
    <aside className="sticky top-3 m-3 mr-0 hidden h-[calc(100dvh-1.5rem)] w-64 shrink-0 flex-col overflow-hidden rounded-xl bg-surface shadow-sm lg:flex">
      <div className="flex h-16 items-center px-5">
        <Brand />
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-5 scrollbar-thin">
        <SidebarNav groups={groups} />
      </div>
      <SidebarUser />
    </aside>
  );
}

function SidebarUser() {
  const user = useAuthStore((state) => state.user);
  if (!user) {
    return null;
  }
  const primary = pickPrimaryRole(user.roles);
  return (
    <div className="m-3 flex items-center gap-3 rounded-lg bg-surface-sunken p-3">
      <Avatar src={user.avatar} name={user.username} size="sm" shape="round" />
      <UserIdentity username={user.username} role={primary} tag={user.tag} />
    </div>
  );
}

function SidebarSheet({
  groups,
  open,
  onOpenChange,
}: {
  groups: AdminNavGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" size="sm" aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle asChild>
            <div>
              <Brand />
            </div>
          </SheetTitle>
        </SheetHeader>
        <SheetBody>
          <SidebarNav groups={groups} onNavigate={() => onOpenChange(false)} />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Topbar                                                              */
/* ------------------------------------------------------------------ */

function AccountMenu() {
  const user = useAuthStore((state) => state.user);
  // Выход — только после подтверждения (та же политика, что на сайте).
  const logoutConfirm = useLogoutConfirm('/login');
  if (!user) {
    return null;
  }
  const primary = pickPrimaryRole(user.roles);
  return (
    <>
      <DropdownMenu>
        <Tooltip content="Аккаунт">
          <DropdownMenuTrigger asChild>
            <ProfileTrigger
              username={user.username}
              avatar={user.avatar}
              aria-label={`Аккаунт ${user.username}`}
            />
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="flex flex-col gap-1">
            <UserIdentity username={user.username} role={primary} tag={user.tag} />
            {user.roles.length > 0 ? (
              <span className="text-xs font-normal text-muted-foreground">
                {user.roles.map((role) => role.displayName).join(' · ')}
              </span>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/">
              <UserRound />
              На сайт
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => logoutConfirm.request()}>
            <LogOut />
            Выйти
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {logoutConfirm.dialog}
    </>
  );
}

function Topbar({
  onOpenMenu,
  onOpenPalette,
  children,
}: {
  onOpenMenu: () => void;
  onOpenPalette: () => void;
  children?: ReactNode;
}) {
  return (
    <header className="sticky top-3 z-30 mx-3 mt-3 flex min-h-14 items-center gap-2 rounded-xl bg-surface px-4 shadow-sm md:px-5">
      <Tooltip content="Разделы">
        <IconButton
          aria-label="Открыть разделы"
          variant="outline"
          className="lg:hidden"
          onClick={onOpenMenu}
        >
          <Menu />
        </IconButton>
      </Tooltip>
      <div className="min-w-0 flex-1">{children}</div>
      <Button
        variant="secondary"
        className="hidden text-muted-foreground md:inline-flex md:w-64 md:justify-start"
        onClick={onOpenPalette}
      >
        <Search />
        <span className="flex-1 text-left font-normal">Поиск и команды</span>
        <span className="flex gap-0.5">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </Button>
      <Tooltip content="Поиск и команды" shortcut={['Ctrl', 'K']}>
        <IconButton aria-label="Поиск и команды" className="md:hidden" onClick={onOpenPalette}>
          <Search />
        </IconButton>
      </Tooltip>
      <ThemeToggle />
      <AccountMenu />
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Командная палитра: только разделы, доступные пользователю           */
/* ------------------------------------------------------------------ */

function AdminCommandPalette({
  groups,
  open,
  onOpenChange,
}: {
  groups: AdminNavGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Поиск и команды">
      <CommandInput placeholder="Раздел админки…" />
      <CommandList>
        <CommandEmpty>Ничего не найдено</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group.id} heading={group.title}>
            {group.items.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <CommandItem
                  key={item.href}
                  value={`${item.label} ${item.keywords?.join(' ') ?? ''}`}
                  onSelect={() => go(item.href)}
                >
                  <Icon />
                  {item.label}
                  {item.exact ? <CommandShortcut keys={['G', 'D']} /> : null}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

export interface AdminShellProps {
  children: ReactNode;
  /// Содержимое верхней панели (крошки страницы).
  topbar?: ReactNode;
}

/// Каркас админ-панели: permission-driven сайдбар (desktop) / sheet
/// (mobile), верхняя панель, командная палитра (Ctrl+K). Плотность —
/// рабочий инструмент: контролы 34–38px, таблицы 44px.
export function AdminShell({ children, topbar }: AdminShellProps) {
  const groups = useVisibleNav();
  const [menuOpen, setMenuOpen] = useState(false);
  const palette = useCommandPalette();

  return (
    <div className="flex min-h-dvh bg-background text-foreground [--card-p:20px] [--control-h-sm:32px] [--control-h:38px] [--control-px:14px] [--gap:16px] [--row-h:44px]">
      <DocumentBadge variant="admin" />
      <Sidebar groups={groups} />
      <SidebarSheet groups={groups} open={menuOpen} onOpenChange={setMenuOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMenu={() => setMenuOpen(true)} onOpenPalette={palette.toggle}>
          {topbar}
        </Topbar>
        <main id="admin-main" className="flex flex-1 flex-col gap-6 px-3 pb-8 pt-5 md:gap-8">
          {children}
        </main>
      </div>
      <AdminCommandPalette groups={groups} open={palette.open} onOpenChange={palette.setOpen} />
    </div>
  );
}
