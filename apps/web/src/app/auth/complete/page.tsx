'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAuthStore } from '@/lib/auth/store';

function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

/// Завершение входа через Discord: backend уже выставил refresh-cookie —
/// здесь сессия восстанавливается и пользователь уходит на `next`.
function CompleteLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));
  const status = useAuthStore((state) => state.status);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(next);
      return;
    }
    if (status === 'idle') {
      bootstrap().catch(() => setFailed(true));
    }
    if (status === 'anonymous') {
      setFailed(true);
    }
  }, [status, bootstrap, router, next]);

  return (
    <AuthShell title="Вход" description="Завершаем вход в аккаунт twomc.su.">
      {failed ? (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-destructive" role="alert">
            Не удалось завершить вход. Попробуйте ещё раз.
          </p>
          <Button onClick={() => router.replace(`/login?next=${encodeURIComponent(next)}`)}>
            Вернуться ко входу
          </Button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Spinner className="size-4" />
          Входим…
        </p>
      )}
    </AuthShell>
  );
}

export default function AuthCompletePage() {
  return (
    <Suspense fallback={null}>
      <CompleteLogin />
    </Suspense>
  );
}
