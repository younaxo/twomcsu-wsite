'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '@/lib/auth/store';

export const CHANGE_PASSWORD_PATH = '/settings/security';

/// Обязательная смена пароля (срез 1.2): аккаунт с `mustChangePassword`
/// (например, bootstrap с выданным паролем) с любой страницы сайта попадает в
/// «Настройки → Безопасность», пока не сменит пароль. Сама страница и выход
/// доступны — цикла нет.
export function MustChangePasswordRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const required = useAuthStore(
    (state) => state.status === 'authenticated' && Boolean(state.user?.mustChangePassword),
  );
  useEffect(() => {
    if (required && pathname !== CHANGE_PASSWORD_PATH) {
      router.replace(`${CHANGE_PASSWORD_PATH}?required=1`);
    }
  }, [required, pathname, router]);
  return null;
}
