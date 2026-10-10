'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/// Снять установленный SW и удалить его кэши (`twomc-*`).
export async function removeServiceWorker() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((item) => item.unregister()));
  if (typeof caches === 'undefined') return;
  const keys = await caches.keys();
  await Promise.all(
    keys.filter((key) => key.startsWith('twomc-')).map((key) => caches.delete(key)),
  );
}

/// Адрес SW: production — полный (кэш + push, ADR-0086/0097); вне production —
/// только push (`?mode=push`, без кэширования: dev-чанки Next не хешированы, и
/// cache-first отдавал бы старый код вместо HMR).
export function serviceWorkerUrl(env: string | undefined = process.env.NODE_ENV): string {
  return env === 'production' ? '/sw.js' : '/sw.js?mode=push';
}

/// Только внутренний путь (как в SW и на сервере).
function isInternalPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\')
  );
}

/// Регистрация Service Worker. `NEXT_PUBLIC_SW_DISABLED=true` — аварийный
/// выключатель: снимает уже установленный SW у посетителей. Клик по
/// системному уведомлению: SW фокусирует открытую вкладку и присылает
/// `twomc:navigate` — переход без перезагрузки и без новой вкладки.
export function ServiceWorkerRegistration() {
  const router = useRouter();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NEXT_PUBLIC_SW_DISABLED === 'true') {
      void removeServiceWorker().catch(() => undefined);
      return;
    }
    const register = async () => {
      if (process.env.NODE_ENV !== 'production') {
        // Остатки production-SW и его кэшей на localhost — снять.
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations
            .filter((item) => !item.active?.scriptURL.includes('mode=push'))
            .map((item) => item.unregister()),
        );
        if (typeof caches !== 'undefined') {
          const keys = await caches.keys();
          await Promise.all(
            keys.filter((key) => key.startsWith('twomc-')).map((key) => caches.delete(key)),
          );
        }
      }
      await navigator.serviceWorker.register(serviceWorkerUrl(), { scope: '/' });
    };
    void register().catch(() => undefined);

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; url?: unknown } | null;
      if (data?.type === 'twomc:navigate' && isInternalPath(data.url)) router.push(data.url);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [router]);
  return null;
}
