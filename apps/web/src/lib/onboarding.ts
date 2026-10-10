'use client';

import { create } from 'zustand';

/// Очередь onboarding-подсказок (ADR-0097): одновременно — только одна
/// подсказка с затемнением. Приоритет: регистрация (1) важнее разрешения
/// уведомлений (2) — пока активна более важная, менее важная ждёт.

export const ONBOARDING_PRIORITY = { registration: 1, notifications: 2 } as const;
export type OnboardingId = keyof typeof ONBOARDING_PRIORITY;

interface OnboardingQueue {
  active: OnboardingId | null;
  /// Занять показ; false — сейчас показывается другая подсказка.
  claim: (id: OnboardingId) => boolean;
  release: (id: OnboardingId) => void;
}

export const useOnboardingQueue = create<OnboardingQueue>((set, get) => ({
  active: null,
  claim: (id) => {
    const active = get().active;
    if (active === id) return true;
    if (active && ONBOARDING_PRIORITY[active] <= ONBOARDING_PRIORITY[id]) return false;
    set({ active: id });
    return true;
  },
  release: (id) => {
    if (get().active === id) set({ active: null });
  },
}));

/// Открыт ли сейчас какой-нибудь диалог (тогда подсказка ждёт).
export function dialogOpen(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
    ) !== null
  );
}
