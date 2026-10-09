/// Тема интерфейса (ADR-0063): по умолчанию — КАК В СИСТЕМЕ
/// (prefers-color-scheme); пользователь может закрепить «Тёмная»/«Светлая».
/// Dark — основная проработка «Полдня», Light — адаптация той же системы.
/// Выбор хранится в localStorage под версионированным ключом; админка
/// использует ту же настройку.
export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'twomc.theme.v1';
export const DEFAULT_THEME: ThemePreference = 'system';
/// SSR не знает тему ОС: отдаём dark, inline-скрипт в <head> выставляет
/// фактическую тему ДО первой отрисовки (без вспышки).
export const SSR_THEME: ResolvedTheme = 'dark';
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
/// data-theme="dark"; скрипт применяет сохранённый выбор или тему ОС).
/// Без внешних зависимостей, любая ошибка проглатывается.
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var p=localStorage.getItem(k);var t;if(p==='light'||p==='dark'){t=p}else{t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},t)}catch(e){}})();`;
