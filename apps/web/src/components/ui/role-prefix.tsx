'use client';

import { ROLE_PREFIX_HEIGHT } from '@twomc/shared';
import { useState, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { getRolePrefixAsset, type DisplayableRole } from '@/lib/roles/primary-role';
import { Badge } from './badge';
import { Tooltip } from './tooltip';

/// Масштаб pixel-art строго целочисленный — иначе PNG размывается.
/// Исходник 7px высотой; xs=14px (data grid, чат, списки), sm=21px
/// (комментарии, строки пользователей), md=28px (hover card, карточка
/// профиля), lg=42px (шапка профиля, admin-превью роли).
export type RolePrefixSize = 'xs' | 'sm' | 'md' | 'lg';

const SCALE: Record<RolePrefixSize, number> = { xs: 2, sm: 3, md: 4, lg: 6 };

export interface RolePrefixProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'role'> {
  /// Роль из контракта (`MeRole` / `RoleDto` / `UserRoleDto.role`): нужны slug,
  /// displayName, priority, color. Либо передайте `slug` + `name`.
  role?: DisplayableRole | null;
  slug?: string | null;
  /// Подпись для alt/fallback, если передан только slug.
  name?: string;
  size?: RolePrefixSize;
  /// Подсказка с названием роли при hover/focus (TwoMC Tooltip, не title="").
  tooltip?: boolean;
  /// Что показать, если графического префикса нет или он не загрузился:
  /// `badge` — текстовый бейдж роли (по умолчанию), `none` — ничего.
  fallback?: 'badge' | 'none';
  /// Приоритет загрузки: в шапке профиля — `eager`, в списках — `lazy` (по умолчанию).
  loading?: 'eager' | 'lazy';
}

/// Графический префикс роли TwoMC (PNG из resource pack на CDN). Только
/// визуализация роли — права определяет backend RBAC, не изображение.
export function RolePrefix({
  role,
  slug,
  name,
  size = 'sm',
  tooltip = true,
  fallback = 'badge',
  loading = 'lazy',
  className,
  ...props
}: RolePrefixProps) {
  const resolvedSlug = role?.slug ?? slug ?? null;
  const label = role?.displayName ?? name ?? resolvedSlug ?? '';
  const asset = getRolePrefixAsset(resolvedSlug);
  const [failed, setFailed] = useState(false);

  if (!asset || failed) {
    if (fallback === 'none' || !label) {
      return null;
    }
    return (
      <Badge color={role?.color ?? null} className={className} {...props}>
        {label}
      </Badge>
    );
  }

  const scale = SCALE[size];
  const image = (
    <span className={cn('inline-flex shrink-0 items-center align-middle', className)} {...props}>
      {/* Обычный <img>, не next/image: pixel-art 7px нельзя ресемплить. */}
      <img
        src={asset.url}
        alt={label}
        width={asset.width * scale}
        height={ROLE_PREFIX_HEIGHT * scale}
        loading={loading}
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
        className="max-w-full select-none [image-rendering:pixelated]"
        style={{ height: ROLE_PREFIX_HEIGHT * scale, width: 'auto' }}
      />
    </span>
  );

  if (!tooltip) {
    return image;
  }
  return (
    <Tooltip
      content={
        <span className="block">
          <span className="block font-medium">{label}</span>
          <span className="block text-background/80">Роль команды TwoMC</span>
        </span>
      }
    >
      <span tabIndex={0} className="inline-flex rounded-sm">
        {image}
      </span>
    </Tooltip>
  );
}

export interface UserRolesInlineProps {
  roles: readonly DisplayableRole[];
  size?: RolePrefixSize;
  /// Показать остальные роли текстовыми бейджами после основной.
  showSecondary?: boolean;
  className?: string;
}

/// Основная роль (самая старшая с префиксом) — графикой; остальные —
/// опционально бейджами. По умолчанию рядом с ником показывается одна.
export function UserRolesInline({
  roles,
  size = 'xs',
  showSecondary = false,
  className,
}: UserRolesInlineProps) {
  if (roles.length === 0) {
    return null;
  }
  const sorted = roles.toSorted((a, b) => b.priority - a.priority);
  const primary = sorted.find((r) => getRolePrefixAsset(r.slug) !== null) ?? sorted[0];
  const rest = showSecondary ? sorted.filter((r) => r !== primary) : [];
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      <RolePrefix role={primary} size={size} />
      {rest.map((r) => (
        <Badge key={r.slug} color={r.color ?? null}>
          {r.displayName}
        </Badge>
      ))}
    </span>
  );
}
