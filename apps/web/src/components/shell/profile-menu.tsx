'use client';

import { LayoutDashboard, LogIn, LogOut, Settings, Shield, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RolePrefix } from '@/components/ui/role-prefix';
import { Skeleton } from '@/components/ui/skeleton';
import { ADMIN_ENTRY_REQUIREMENT } from '@/lib/admin/navigation';
import { useAuthStore } from '@/lib/auth/store';
import { usePermissions } from '@/lib/auth/use-permissions';
import { pickPrimaryRole } from '@/lib/roles/primary-role';

/// Аватар + меню профиля в header. Анонимам — кнопка «Войти». Пункты,
/// маршруты которых ещё не существуют (настройки/безопасность/сессии),
/// ведут на /login?next= только когда появятся — пока показываем
/// недоступными, чтобы не вести в 404.
export function ProfileMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const logout = useAuthStore((state) => state.logout);
  const { can } = usePermissions();

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

  const primary = pickPrimaryRole(user.roles);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Профиль: ${user.username}`}
          className="flex h-control items-center gap-2 rounded px-1.5 hover:bg-muted"
        >
          <Avatar name={user.username} size="sm" shape="round" />
          <span className="hidden max-w-32 truncate text-sm font-medium md:inline">
            {user.username}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            {primary ? <RolePrefix role={primary} size="xs" /> : null}
            <span className="truncate">{user.username}</span>
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {primary?.displayName ?? 'Игрок'}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <UserRound />
          Профиль
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Settings />
          Настройки
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Shield />
          Безопасность и сессии
        </DropdownMenuItem>
        {can(ADMIN_ENTRY_REQUIREMENT) ? (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <LayoutDashboard />
              Админ-панель
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logout().then(() => router.refresh())}>
          <LogOut />
          Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
