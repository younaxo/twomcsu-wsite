/// Тема интерфейса: продуктовый default — ТЁМНАЯ (решение владельца,
/// «Полдень» dark-first). Светлая — вторичная; «системная» — опция, не
/// умолчание. Выбор хранится в localStorage под версионированным ключом.
export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'twomc.theme.v1';
export const DEFAULT_THEME: ThemePreference = 'dark';
export const THEME_ATTRIBUTE = 'data-theme';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'dark' || value === 'light' || value === 'system';
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === 'system') {
    return systemDark ? 'dark' : 'light';
  }
  return preference;
}

/// Inline-скрипт для <head>: выставляет data-theme ДО первой отрисовки,
/// чтобы не было вспышки светлой/тёмной темы при загрузке (SSR отдаёт
/// data-theme="dark" по умолчанию; скрипт лишь применяет сохранённый выбор).
/// Без внешних зависимостей, любая ошибка проглатывается.
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var p=localStorage.getItem(k);var t=${JSON.stringify(DEFAULT_THEME)};if(p==='light'||p==='dark'){t=p}else if(p==='system'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},t)}catch(e){}})();`;
