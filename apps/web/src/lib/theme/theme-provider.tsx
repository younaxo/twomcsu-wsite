'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_THEME,
  isThemePreference,
  resolveTheme,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from './theme';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/// Держит выбранную тему в состоянии, пишет её в localStorage и на <html>.
/// Первый рендер совпадает с SSR (default dark); сохранённый выбор
/// применяет inline-скрипт в <head> ещё до гидрации, провайдер лишь
/// синхронизирует состояние React после монтирования.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_THEME);
  const [systemDark, setSystemDark] = useState(true);

  useEffect(() => {
    setPreferenceState(readStoredPreference());
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mql.matches);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const resolved = resolveTheme(preference, systemDark);

  useEffect(() => {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, resolved);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Приватный режим/запрет storage — тема просто не запомнится.
    }
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme: нет ThemeProvider выше по дереву');
  }
  return context;
}

export { systemPrefersDark };
