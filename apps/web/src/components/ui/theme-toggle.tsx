'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme/theme-provider';
import type { ThemePreference } from '@/lib/theme/theme';
import { IconButton } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Tooltip } from './tooltip';

const LABELS: Record<ThemePreference, string> = {
  dark: 'Тёмная',
  light: 'Светлая',
  system: 'Как в системе',
};

/// Переключатель темы: тёмная (по умолчанию) / светлая / как в системе.
/// Кнопка показывает текущую фактическую тему, меню — выбор.
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, resolved, setPreference } = useTheme();
  const Icon = preference === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun;
  return (
    <DropdownMenu>
      <Tooltip content={`Тема: ${LABELS[preference]}`}>
        <DropdownMenuTrigger asChild>
          <IconButton aria-label="Сменить тему" variant="ghost" className={className}>
            <Icon />
          </IconButton>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) => setPreference(value as ThemePreference)}
        >
          <DropdownMenuRadioItem value="dark">
            <Moon aria-hidden />
            {LABELS.dark}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">
            <Sun aria-hidden />
            {LABELS.light}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor aria-hidden />
            {LABELS.system}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
