'use client';

import { createContext, useContext, type ReactNode } from 'react';

/// Режим каркаса (шапка, футер): по умолчанию — основной сайт, ничего не меняется.
/// На отдельном сайте розыгрыша (GIVEAWAY_ONLY) провайдер включает «внешний» режим:
/// ссылки ведут на основной сайт абсолютными адресами, блокам, которым нужен API
/// основного сайта, запросы не отправляются, а надпись «twomc.su» — одного цвета.
export interface ShellMode {
  /// Адрес основного сайта без завершающего «/». null — мы и есть основной сайт.
  mainSiteUrl: string | null;
  /// Надпись «twomc.su» без оранжевой «o».
  monochromeLogo: boolean;
}

const MAIN: ShellMode = { mainSiteUrl: null, monochromeLogo: false };

const ShellModeContext = createContext<ShellMode>(MAIN);

export function ShellModeProvider({ value, children }: { value: ShellMode; children: ReactNode }) {
  return <ShellModeContext.Provider value={value}>{children}</ShellModeContext.Provider>;
}

export function useShellMode(): ShellMode {
  return useContext(ShellModeContext);
}

/// Абсолютный адрес на основном сайте для внутреннего пути; в обычном режиме путь как есть.
export function resolveShellHref(mainSiteUrl: string | null, href: string): string {
  if (mainSiteUrl === null || !href.startsWith('/')) return href;
  return `${mainSiteUrl}${href}`;
}
