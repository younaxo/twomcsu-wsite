'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { RolePrefix } from '@/components/ui/role-prefix';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import type { DemoUser } from '../../demo-data';

/// Фиксированное «сейчас»: демо-данные датированы 8 октября 2026, относительные
/// даты и фильтры по периоду должны совпадать на сервере и клиенте.
export const DEMO_NOW = new Date('2026-10-08T12:30:00Z');

/// Роль из демо-данных → slug графического префикса TwoMC. У игроков и VIP
/// префикса нет — роль показывается текстовым бейджем.
const ROLE_SLUGS: Record<string, string> = {
  Owner: 'owner',
  'Chief Curator': 'chief-curator',
  'Senior Curator': 'senior-curator',
  'Старший модератор': 'senior-moderator',
  Хелпер: 'helper',
};

export function roleSlug(user: DemoUser): string | null {
  return ROLE_SLUGS[user.role] ?? null;
}

export function isStaff(user: DemoUser): boolean {
  return roleSlug(user) !== null;
}

const pluralRules = new Intl.PluralRules('ru-RU');
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric' });
const monthFormat = new Intl.DateTimeFormat('ru-RU', { month: 'short' });

/// «1 игрок, 2 игрока, 5 игроков» — формы one/few/many по правилам Intl.
export function pluralRu(count: number, one: string, few: string, many: string): string {
  const category = pluralRules.select(count);
  const word = category === 'one' ? one : category === 'few' ? few : many;
  return `${formatNumber(count)} ${word}`;
}

export function formatHours(hours: number): string {
  return `${formatNumber(hours)} ч`;
}

export function formatTime(value: string): string {
  return timeFormat.format(new Date(value));
}

/// День и короткий месяц для календарного блока события: «11» и «окт.».
export function dateParts(value: string): { day: string; month: string } {
  const date = new Date(value);
  return { day: dayFormat.format(date), month: monthFormat.format(date) };
}

/// Счётчик «включается» после монтирования: SSR отдаёт 0, клиент набегает до
/// значения — табло оживает, как и положено живым данным.
export function useLiveValue(value: number): number {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    setCurrent(value);
  }, [value]);
  return current;
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export interface UserNameProps {
  user: DemoUser;
  size?: 'xs' | 'sm';
  className?: string;
}

/// Ник с графическим префиксом роли — префикс только у команды проекта.
export function UserName({ user, size = 'xs', className }: UserNameProps) {
  const slug = roleSlug(user);
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      {slug ? (
        // Обёртка tooltip у RolePrefix сжимается во flex — фиксируем ширину префикса.
        <span className="inline-flex shrink-0">
          <RolePrefix slug={slug} name={user.role} size={size} />
        </span>
      ) : null}
      <span className="truncate font-medium">{user.username}</span>
    </span>
  );
}

/// Роль текстом: у VIP и команды — цвет роли из данных, у игрока — просто слово.
export function RoleLabel({ user }: { user: DemoUser }) {
  if (user.roleColor) {
    return <Badge color={user.roleColor}>{user.role}</Badge>;
  }
  return <span className="text-sm text-muted-foreground">{user.role}</span>;
}
