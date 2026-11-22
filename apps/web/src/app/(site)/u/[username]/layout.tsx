import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { safeHandle } from '@/lib/safe-handle';

/// Заголовок вкладки — «ник — twomc.su»; ник берётся из адреса. Данные профиля
/// сервер не рендерит (страница клиентская), поэтому приватное в метаданные
/// не попадает.
export function generateMetadata({ params }: { params: { username: string } }): Metadata {
  const handle = safeHandle(params.username);
  const description = `Профиль игрока ${handle} на twomc.su`;
  return {
    title: handle,
    description,
    openGraph: { title: `${handle} — twomc.su`, description, type: 'profile' },
    twitter: { title: `${handle} — twomc.su`, description },
  };
}

export default function PublicProfileLayout({ children }: { children: ReactNode }) {
  return children;
}
