import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/// Заголовок вкладки по решению владельца всегда «twomc.su» (корневой layout);
/// ник профиля — только в описании и Open Graph для превью ссылок. Данные
/// профиля сервер не рендерит (страница клиентская), поэтому приватное в
/// метаданные не попадает.
export function generateMetadata({ params }: { params: { username: string } }): Metadata {
  const handle = safeHandle(params.username);
  const description = `Профиль игрока ${handle} на twomc.su`;
  return {
    description,
    openGraph: { title: `${handle} — twomc.su`, description, type: 'profile' },
    twitter: { title: `${handle} — twomc.su`, description },
  };
}

function safeHandle(raw: string): string {
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    // Битый %-escape — показываем как есть.
  }
  return value.slice(0, 32);
}

export default function PublicProfileLayout({ children }: { children: ReactNode }) {
  return children;
}
