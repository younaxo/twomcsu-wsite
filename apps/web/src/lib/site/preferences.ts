'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { CURRENCIES, LOCALES, type CurrencyOption, type LocaleOption } from './config';

/// Предпочтения посетителя: язык и валюта — две независимые настройки
/// (не «русский = только RUB»). Хранятся в localStorage; недоступные
/// варианты (без поддержки на сервере) выбрать нельзя — store это
/// гарантирует сам, а не только UI.

export interface SitePreferences {
  locale: LocaleOption['code'];
  currency: CurrencyOption['code'];
  setLocale: (locale: LocaleOption['code']) => void;
  setCurrency: (currency: CurrencyOption['code']) => void;
}

export const usePreferences = create<SitePreferences>()(
  persist(
    (set) => ({
      locale: 'ru',
      currency: 'RUB',
      setLocale: (locale) => {
        if (LOCALES.find((item) => item.code === locale)?.available) {
          set({ locale });
        }
      },
      setCurrency: (currency) => {
        if (CURRENCIES.find((item) => item.code === currency)?.available) {
          set({ currency });
        }
      },
    }),
    {
      name: 'twomc.preferences',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ locale: state.locale, currency: state.currency }),
    },
  ),
);

export function findLocale(code: LocaleOption['code']): LocaleOption {
  return LOCALES.find((item) => item.code === code) ?? LOCALES[0];
}

export function findCurrency(code: CurrencyOption['code']): CurrencyOption {
  return CURRENCIES.find((item) => item.code === code) ?? CURRENCIES[0];
}
