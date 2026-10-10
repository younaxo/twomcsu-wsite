'use client';

import { useEffect } from 'react';

/// Звук уведомлений (ADR-0097) — единый сервис, без `new Audio()` по
/// компонентам. Ассет `notification-message` — короткий мягкий двухтоновый
/// сигнал (своя генерация, ~0,5 с). Один `id` события — не больше одного звука.
/// Готовится после первого действия человека (autoplay-политика браузера).
/// Работает, пока страница открыта: в фоне звук системного push — у браузера
/// и ОС, свой файл туда не подставляем.

export const NOTIFICATION_SOUNDS = {
  message: '/sounds/notification-message.wav',
} as const;

export const NOTIFICATION_VOLUME = 0.35;
/// Тише — когда нужный диалог уже открыт (сообщение видно и так).
export const NOTIFICATION_VOLUME_QUIET = 0.15;
const MAX_REMEMBERED = 200;

class NotificationSoundService {
  private audio: HTMLAudioElement | null = null;
  private readonly played: string[] = [];

  /// Создать и предзагрузить звук (после жеста пользователя).
  prime(): void {
    if (this.audio || typeof Audio === 'undefined') return;
    const audio = new Audio(NOTIFICATION_SOUNDS.message);
    audio.preload = 'auto';
    audio.volume = NOTIFICATION_VOLUME;
    this.audio = audio;
  }

  /// true — звук запущен; false — дубликат этого события или звук недоступен.
  play(id: string, options: { quiet?: boolean } = {}): boolean {
    if (this.played.includes(id)) return false;
    this.played.push(id);
    if (this.played.length > MAX_REMEMBERED) this.played.shift();
    this.prime();
    const audio = this.audio;
    if (!audio) return false;
    audio.volume = options.quiet ? NOTIFICATION_VOLUME_QUIET : NOTIFICATION_VOLUME;
    try {
      audio.currentTime = 0;
    } catch {
      // Ещё не загружен — играем с начала как есть.
    }
    void audio.play()?.catch(() => undefined);
    return true;
  }

  /// Проверка в настройках — всегда играет (вне дедупликации).
  preview(): void {
    this.prime();
    if (!this.audio) return;
    this.audio.volume = NOTIFICATION_VOLUME;
    this.audio.currentTime = 0;
    void this.audio.play()?.catch(() => undefined);
  }

  resetForTests(): void {
    this.audio = null;
    this.played.length = 0;
  }
}

export const notificationSound = new NotificationSoundService();

/// Подготовить звук после первого клика/клавиши на странице.
export function usePrimeNotificationSound(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const prime = () => notificationSound.prime();
    window.addEventListener('pointerdown', prime, { once: true });
    window.addEventListener('keydown', prime, { once: true });
    return () => {
      window.removeEventListener('pointerdown', prime);
      window.removeEventListener('keydown', prime);
    };
  }, [enabled]);
}
