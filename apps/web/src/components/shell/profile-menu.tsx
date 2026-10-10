'use client';

import { LogIn, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLogoutConfirm } from '@/components/auth/logout-confirm';
import { Button } from '@/components/ui/button';
import {
  BottomSheet,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useMenuPresentation,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { ADMIN_ENTRY_REQUIREMENT } from '@/lib/admin/navigation';
import { useAuthStore } from '@/lib/auth/store';
import { usePermissions } from '@/lib/auth/use-permissions';
import { useWallet } from '@/lib/account/hooks';
import { cn } from '@/lib/cn';
import { useIncomingRequestsCount } from '@/lib/friends/hooks';
import { useProfileSummary } from '@/lib/profile/hooks';
import { formatBadgeCount } from '@/lib/site/document-badge';
import {
  MINI_PROFILE_ADMIN,
  MiniProfileAdminContent,
  MiniProfileSummary,
  miniProfileAdminClassName,
  miniProfileEntries,
} from './mini-profile';
import { floatingClearance } from './floating-actions';
import { ProfileTrigger } from './profile-trigger';

const SOON = 'скоро';

/// Счётчик пункта меню (новые заявки в друзья) — справа, как у уведомлений.
function EntryBadge({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <span
      className="ml-auto rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-primary-foreground tabular-nums"
      aria-label={`новых: ${count}`}
      data-testid="mini-profile-badge"
    >
      {formatBadgeCount(count)}
    </span>
  );
}

/// Аватар + mini profile в header (ADR-0088, ADR-0093). Анонимам — «Войти».
/// Desktop — меню-popover с шапкой профиля; mobile — bottom sheet с тем же
/// содержимым и теми же данными. Порядок: шапка → кошелёк → меню аккаунта →
/// отдельный блок «Админ-панель» (только по праву) → «Выйти».
export function ProfileMenu() {
  const pathname = usePathname();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  // Выход — только после подтверждения (одна политика для popover и sheet).
  const logoutConfirm = useLogoutConfirm('refresh');
  const { can } = usePermissions();
  const presentation = useMenuPresentation();
  const [open, setOpen] = useState(false);
  // Не заходить на плавающие кнопки (см. floatingClearance) — замер при открытии.
  const [bottomClearance, setBottomClearance] = useState(8);
  const summary = useProfileSummary(user?.username ?? '', open && !!user);
  const wallet = useWallet(open && !!user);
  const friendRequests = useIncomingRequestsCount(status === 'authenticated' && !!user);

  useEffect(() => {
    if (status === 'idle') {
      bootstrap().catch(() => undefined);
    }
  }, [status, bootstrap]);

  if (status === 'idle' || status === 'loading') {
    return <Skeleton className="size-9 rounded-full" />;
  }
  if (status !== 'authenticated' || !user) {
    return (
      <Button asChild size="sm" variant="secondary">
        <Link href={`/login?next=${encodeURIComponent(pathname)}`}>
          <LogIn />
          Войти
        </Link>
      </Button>
    );
  }

  const entries = miniProfileEntries(user.username, {
    friendRequests: friendRequests.data?.count,
  });
  const admin = can(ADMIN_ENTRY_REQUIREMENT);
  const header = (bleed: boolean) => (
    <MiniProfileSummary
      user={user}
      summary={summary.data}
      wallet={wallet.data}
      walletLoading={wallet.isPending && wallet.fetchStatus !== 'idle'}
      bleed={bleed}
    />
  );
  const trigger = (
    <ProfileTrigger
      username={user.username}
      avatar={user.avatar}
      aria-label={`Профиль: ${user.username}`}
    />
  );

  if (presentation === 'sheet') {
    return (
      <>
        <ProfileTrigger
          username={user.username}
          avatar={user.avatar}
          aria-label={`Профиль: ${user.username}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        />
        <BottomSheet open={open} onOpenChange={setOpen}>
          <DrawerContent>
            <DrawerHeader className="sr-only">
              <DrawerTitle>Профиль {user.username}</DrawerTitle>
              <DrawerDescription>Мой профиль и разделы аккаунта</DrawerDescription>
            </DrawerHeader>
            <DrawerBody className="flex flex-col gap-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
              {header(false)}
              <nav aria-label="Разделы аккаунта" className="flex flex-col gap-0.5">
                {entries.map((entry) =>
                  entry.href ? (
                    <DrawerClose key={entry.key} asChild>
                      <Button asChild variant="ghost" className="h-11 justify-start">
                        <Link href={entry.href}>
                          <entry.icon />
                          {entry.label}
                          <EntryBadge count={entry.badge} />
                        </Link>
                      </Button>
                    </DrawerClose>
                  ) : (
                    <Button
                      key={entry.key}
                      variant="ghost"
                      disabled
                      className="h-11 justify-start"
                      data-entry={entry.key}
                    >
                      <entry.icon />
                      {entry.label}
                      <span className="ml-auto text-xs text-subtle-foreground">{SOON}</span>
                    </Button>
                  ),
                )}
              </nav>
              {admin ? (
                <>
                  <div className="h-px bg-border-subtle" />
                  <nav aria-label="Администрирование" data-testid="mini-profile-admin">
                    <DrawerClose asChild>
                      <Button
                        asChild
                        variant="ghost"
                        className={cn('w-full justify-start', miniProfileAdminClassName)}
                      >
                        <Link href={MINI_PROFILE_ADMIN.href}>
                          <MiniProfileAdminContent />
                        </Link>
                      </Button>
                    </DrawerClose>
                  </nav>
                </>
              ) : null}
              <div className="h-px bg-border-subtle" />
              <Button
                variant="ghost"
                className="h-11 justify-start"
                onClick={() => {
                  setOpen(false);
                  logoutConfirm.request();
                }}
              >
                <LogOut />
                Выйти
              </Button>
            </DrawerBody>
          </DrawerContent>
        </BottomSheet>
        {logoutConfirm.dialog}
      </>
    );
  }

  return (
    <>
      <DropdownMenu
        open={open}
        onOpenChange={(next) => {
          if (next) setBottomClearance(floatingClearance());
          setOpen(next);
        }}
      >
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          collisionPadding={{ top: 8, right: 8, left: 8, bottom: bottomClearance }}
          className="w-80 overflow-y-auto overflow-x-hidden p-0 scrollbar-thin"
        >
          <div className="pb-3">{header(true)}</div>
          <DropdownMenuSeparator className="mx-0 my-0" />
          <div className="p-1">
            {entries.map((entry) =>
              entry.href ? (
                <DropdownMenuItem key={entry.key} asChild>
                  <Link href={entry.href}>
                    <entry.icon />
                    {entry.label}
                    <EntryBadge count={entry.badge} />
                  </Link>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem key={entry.key} disabled data-entry={entry.key}>
                  <entry.icon />
                  {entry.label}
                  <span className="ml-auto text-xs text-subtle-foreground">{SOON}</span>
                </DropdownMenuItem>
              ),
            )}
          </div>
          {admin ? (
            <>
              <DropdownMenuSeparator className="mx-0 my-0" />
              <div className="p-1" data-testid="mini-profile-admin">
                <DropdownMenuItem asChild className={miniProfileAdminClassName}>
                  <Link href={MINI_PROFILE_ADMIN.href}>
                    <MiniProfileAdminContent />
                  </Link>
                </DropdownMenuItem>
              </div>
            </>
          ) : null}
          <DropdownMenuSeparator className="mx-0 my-0" />
          <div className="p-1">
            <DropdownMenuItem onSelect={() => logoutConfirm.request()}>
              <LogOut />
              Выйти
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      {logoutConfirm.dialog}
    </>
  );
}
