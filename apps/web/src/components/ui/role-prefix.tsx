'use client';

import {
  ROLE_PREFIX_HEIGHT,
  staffPrefix,
  type PrefixCategory,
  type PrefixDefinition,
} from '@twomc/shared';
import { useState, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { crispScale, useDevicePixelRatio } from '@/lib/use-device-pixel-ratio';
import { getPrefixAsset, getRolePrefixAsset, type DisplayableRole } from '@/lib/roles/primary-role';
import { Badge } from './badge';
import { Tooltip } from './tooltip';

/// Масштаб pixel-art: исходник 7px высотой; xs=14px (data grid, списки,
/// строка identity), sm=21px (комментарии, строки пользователей), md=28px
/// (hover card, карточка профиля), lg=42px (admin-превью роли) — целые.
/// `compact` — около ×1.5 (~10 px, mini profile): масштаб подбирается под DPR
/// экрана так, чтобы пиксель исходника был целым числом физических пикселей
/// (`crispScale`), всегда с `image-rendering: pixelated`.
export type RolePrefixSize = 'compact' | 'xs' | 'sm' | 'md' | 'lg';

const SCALE: Record<Exclude<RolePrefixSize, 'compact'>, number> = { xs: 2, sm: 3, md: 4, lg: 6 };
const COMPACT_TARGET = 1.5;

/// Вторая строка тултипа — что это за префикс.
export const PREFIX_KIND_LABEL: Record<PrefixCategory, string> = {
  STAFF: 'Роль команды twomc.su',
  MEDIA: 'Медиа-партнёр twomc.su',
  DONATION: 'Привилегия twomc.su',
};

export interface RolePrefixProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'role' | 'prefix'> {
  /// Роль из контракта (`MeRole` / `RoleDto` / `UserRoleDto.role`): нужны slug,
  /// displayName, priority, color. Либо передайте `slug` + `name`.
  role?: DisplayableRole | null;
  /// Уже выбранный префикс любой категории (`identityPrefix`) — важнее `role`
  /// для картинки; роль остаётся для текстового fallback.
  prefix?: PrefixDefinition | null;
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
  prefix,
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
  const definition = prefix ?? staffPrefix(resolvedSlug);
  const label = (prefix ? prefix.name : null) ?? role?.displayName ?? name ?? resolvedSlug ?? '';
  const asset = prefix ? getPrefixAsset(prefix) : getRolePrefixAsset(resolvedSlug);
  const kind = PREFIX_KIND_LABEL[definition?.category ?? 'STAFF'];
  const [failed, setFailed] = useState(false);
  const dpr = useDevicePixelRatio();

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

  const scale = size === 'compact' ? crispScale(COMPACT_TARGET, dpr) : SCALE[size];
  const height = ROLE_PREFIX_HEIGHT * scale;
  // className и props — на самом внешнем элементе: при тултипе это триггер,
  // иначе обёртка картинки (раньше `self-start` попадал внутрь, а триггер
  // растягивался колонкой flex — тултип центрировался по пустому месту).
  const outer: HTMLAttributes<HTMLSpanElement> = tooltip ? {} : { className, ...props };
  const image = (
    // max-w-full: на узком экране длинный префикс ужимается в ширину контейнера
    // (object-contain, pixelated), а не вылезает за край; shrink-0 — рядом с
    // ником префикс не сжимается раньше времени.
    <span
      {...outer}
      className={cn('inline-flex max-w-full shrink-0 items-center align-middle', outer.className)}
      data-prefix-category={definition?.category ?? 'STAFF'}
      data-prefix-slug={asset.slug}
      data-prefix-scale={scale}
    >
      {/* Обычный <img>, не next/image: pixel-art 7px нельзя ресемплить. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- pixel-art с CDN, фиксированные width/height, lazy */}
      <img
        src={asset.url}
        alt={label}
        width={Math.round(asset.width * scale)}
        height={Math.round(height)}
        loading={loading}
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
        className="max-w-full select-none object-contain object-left [image-rendering:pixelated]"
        style={{ height, width: 'auto' }}
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
          <span className="block text-muted-foreground">{kind}</span>
        </span>
      }
    >
      {/* w-fit: триггер всегда по размеру префикса (в колонке flex не
          растягивается), поэтому тултип привязан к самой картинке. */}
      <span
        tabIndex={0}
        {...props}
        className={cn('inline-flex w-fit min-w-0 max-w-full rounded-sm', className)}
        data-testid="role-prefix-trigger"
      >
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
