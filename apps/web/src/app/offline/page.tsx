import type { Metadata } from 'next';
import { WifiOff } from 'lucide-react';
import { RetryButton } from './retry-button';

export const metadata: Metadata = {
  title: 'Нет подключения',
  robots: { index: false, follow: false },
};

/// Запасная страница без сети (ADR-0086): её отдаёт Service Worker, когда
/// страница не загрузилась. Статическая — без запросов к API и CDN, логотип
/// локальный (`/icon.png` в кэше SW).
export default function OfflinePage() {
  return (
    <main
      id="main"
      data-testid="offline-page"
      className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground"
    >
      <section className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl bg-surface px-6 py-10 text-center shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element -- локальный файл из кэша SW, без оптимизатора */}
        <img
          src="/icon.png"
          alt="twomc.su"
          width={64}
          height={64}
          draggable={false}
          className="select-none rounded-lg"
        />
        <WifiOff aria-hidden className="size-6 text-warning" />
        <h1 className="font-display text-2xl font-bold">Нет подключения</h1>
        <p className="text-sm text-muted-foreground">
          Страница не загрузилась: похоже, пропал интернет или сеть блокирует twomc.su. Ничего не
          потеряно — как только связь появится, просто обновите страницу.
        </p>
        <RetryButton />
        <ul className="w-full space-y-1 text-left text-xs text-subtle-foreground">
          <li>• Проверьте Wi-Fi или мобильную сеть.</li>
          <li>• Если сайт не открывается только у вас — отключите VPN или блокировщик.</li>
        </ul>
      </section>
    </main>
  );
}
