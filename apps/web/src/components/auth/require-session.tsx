'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/lib/auth/store';

/// Страница только для вошедших (любой аккаунт, без admin-прав): восстанавливает
/// сессию по refresh-cookie, анонима отправляет на /login?next=…
export function RequireSession({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'idle') {
      bootstrap().catch(() => undefined);
    }
    if (status === 'anonymous') {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, bootstrap, router, pathname]);

  if (status !== 'authenticated') {
    return (
      <div className="flex flex-col gap-3" aria-busy>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  return <>{children}</>;
}
