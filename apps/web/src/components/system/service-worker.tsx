'use client';

import { useEffect } from 'react';

/// Регистрация Service Worker (ADR-0086) — только в production-сборке:
/// в dev он мешал бы HMR. `NEXT_PUBLIC_SW_DISABLED=true` — аварийный
/// выключатель: снимает уже установленный SW у посетителей.
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    if (process.env.NEXT_PUBLIC_SW_DISABLED === 'true') {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => registrations.forEach((item) => void item.unregister()));
      return;
    }
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);
  return null;
}
