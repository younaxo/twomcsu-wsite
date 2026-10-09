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
  system: 'Системная',
  dark: 'Тёмная',
  light: 'Светлая',
};

const RESOLVED_LABEL = { dark: 'тёмная', light: 'светлая' } as const;

/// Переключатель темы: Системная (по умолчанию) / Тёмная / Светлая.
/// Выбранный режим (preference) отмечен в меню; для «Системной» рядом видна
/// фактическая тема (effective), иконка кнопки — фактическая тема.
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, resolved, setPreference } = useTheme();
  const Icon = resolved === 'dark' ? Moon : Sun;
  const summary =
    preference === 'system'
      ? `Тема: системная (сейчас ${RESOLVED_LABEL[resolved]})`
      : `Тема: ${LABELS[preference].toLowerCase()}`;
  return (
    <DropdownMenu>
      <Tooltip content={summary}>
        <DropdownMenuTrigger asChild>
          <IconButton
            aria-label={`Сменить тему. ${summary}`}
            variant="ghost"
            className={className}
            data-theme-preference={preference}
          >
            <Icon />
          </IconButton>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) => setPreference(value as ThemePreference)}
        >
          <DropdownMenuRadioItem value="system">
            <Monitor aria-hidden />
            {LABELS.system}
            <span className="ml-auto pl-3 text-xs text-muted-foreground">
              {RESOLVED_LABEL[resolved]}
            </span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon aria-hidden />
            {LABELS.dark}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">
            <Sun aria-hidden />
            {LABELS.light}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
