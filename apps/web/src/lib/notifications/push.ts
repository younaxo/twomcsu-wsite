'use client';

import { api } from '@/lib/api/client';

/// Web Push на клиенте (ADR-0097). Разрешение браузера запрашивается ТОЛЬКО из
/// обработчика действия человека (кнопка «Разрешить»), никогда при рендере.
/// Подписка привязывается к текущему пользователю на сервере (upsert по
/// endpoint: вход другим аккаунтом перепривязывает её); выход из аккаунта —
/// отписка этого браузера, чтобы чужие уведомления сюда не приходили.

export type PushPermission = 'unsupported' | 'default' | 'granted' | 'denied';

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function pushPermission(): PushPermission {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission as PushPermission;
}

/// Системный запрос разрешения — вызывать только из onClick.
export async function requestPushPermission(): Promise<PushPermission> {
  if (!pushSupported()) return 'unsupported';
  const result = await Notification.requestPermission();
  return result as PushPermission;
}

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/// Короткое имя устройства для списка в настройках (без отпечатка браузера).
export function deviceName(userAgent: string): string {
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'Браузер';
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad/.test(userAgent)
        ? 'iOS'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : '';
  return os ? `${browser} · ${os}` : browser;
}

async function readyRegistration(timeoutMs = 8000): Promise<ServiceWorkerRegistration | null> {
  const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

export type EnablePushResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'unsupported' | 'denied' | 'default' | 'not-configured' | 'no-worker' | 'error';
    };

/// Подписать этот браузер (разрешение уже дано).
export async function subscribeThisDevice(): Promise<EnablePushResult> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  if (Notification.permission !== 'granted') {
    return { ok: false, reason: Notification.permission === 'denied' ? 'denied' : 'default' };
  }
  try {
    const vapid = await api.get<{ publicKey: string | null; configured: boolean }>(
      '/notifications/push/vapid-key',
    );
    if (!vapid.configured || !vapid.publicKey) return { ok: false, reason: 'not-configured' };
    const registration = await readyRegistration();
    if (!registration) return { ok: false, reason: 'no-worker' };
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.publicKey) as BufferSource,
      }));
    const json = subscription.toJSON() as { endpoint?: string; keys?: Record<string, string> };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: 'error' };
    }
    await api.post('/notifications/push/subscribe', {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      userAgent: navigator.userAgent.slice(0, 255),
      deviceName: deviceName(navigator.userAgent),
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/// Отписать этот браузер: сначала сервер (по endpoint), затем PushManager.
export async function unsubscribeThisDevice(): Promise<void> {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await api
    .post('/notifications/push/unsubscribe', { endpoint: subscription.endpoint })
    .catch(() => undefined);
  await subscription.unsubscribe().catch(() => undefined);
}

/// Подписан ли этот браузер (для переключателя в настройках).
export async function thisDeviceSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  return Boolean(await registration?.pushManager.getSubscription());
}
