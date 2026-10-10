'use client';

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

/// Регистрация Service Worker (ADR-0086) — только в production-сборке.
/// Вне production SW, оставшийся от запуска production-сборки на том же
/// localhost, снимается вместе с кэшами: dev-чанки Next не хешированы, и
/// cache-first отдавал бы старый код вместо HMR. `NEXT_PUBLIC_SW_DISABLED=true`
/// — аварийный выключатель: снимает уже установленный SW у посетителей.
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_SW_DISABLED === 'true') {
      void removeServiceWorker().catch(() => undefined);
      return;
    }
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);
  return null;
}
