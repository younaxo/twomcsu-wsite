'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useLogoutConfirm } from '@/components/auth/logout-confirm';
import { Button } from '@/components/ui/button';
import { ErrorState, ForbiddenState } from '@/components/ui/error-state';
import { Spinner } from '@/components/ui/spinner';
import { ADMIN_ENTRY_REQUIREMENT } from '@/lib/admin/navigation';
import { checkPermissions } from '@/lib/auth/permissions';
import { useAuthStore } from '@/lib/auth/store';

/// Защита /admin: восстанавливает сессию (refresh-cookie → access-token →
/// /auth/me), анонимов отправляет на /login?next=…, пользователей без
/// единого admin-permission — на экран 403. Backend остаётся источником
/// истины: это только UX-слой.
export function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  // Выход — только после подтверждения (та же политика, что на сайте).
  const logoutConfirm = useLogoutConfirm('/');
  const [bootError, setBootError] = useState<unknown>(null);

  useEffect(() => {
    if (status === 'idle') {
      bootstrap().catch((error: unknown) => setBootError(error));
    }
  }, [status, bootstrap]);

  useEffect(() => {
    if (status === 'anonymous' && !bootError) {
      const next = encodeURIComponent(pathname);
      router.replace(`/login?next=${next}`);
    }
  }, [status, bootError, pathname, router]);

  if (bootError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <ErrorState
          error={bootError}
          title="Не удалось связаться с сервером"
          description="Проверьте подключение и попробуйте ещё раз."
          onRetry={() => {
            setBootError(null);
            bootstrap().catch((error: unknown) => setBootError(error));
          }}
        />
      </div>
    );
  }

  if (status !== 'authenticated' || !user) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center gap-3 text-sm text-muted-foreground"
      >
        <Spinner />
        Проверяем сессию…
      </div>
    );
  }

  if (!checkPermissions(user.permissions, ADMIN_ENTRY_REQUIREMENT)) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <ForbiddenState
          title="В админ-панель доступа нет"
          description={`Аккаунт ${user.username} не имеет ни одного права администрирования. Если это ошибка — обратитесь к куратору.`}
          action={
            <Button variant="secondary" onClick={() => logoutConfirm.request()}>
              Выйти
            </Button>
          }
        />
        {logoutConfirm.dialog}
      </div>
    );
  }

  return children;
}
