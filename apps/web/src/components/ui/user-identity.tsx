'use client';

import { ProfilePreview } from '@/components/profile/profile-preview';
import { cn } from '@/lib/cn';
import { identityPrefix, type DisplayableRole } from '@/lib/roles/primary-role';
import { RolePrefix, type RolePrefixSize } from './role-prefix';

/// Discriminator из тега `ник#0000` (если передан только тег).
export function discriminatorOf(tag: string | null | undefined): string | null {
  const suffix = tag?.split('#')[1];
  return suffix && /^\d{4}$/.test(suffix) ? suffix : null;
}

/// Identity пользователя (ADR-0099) — ВСЕГДА одна строка:
/// `[PREFIX] ник#0000`. Префикс и ник не переносятся друг под друга ни на
/// каком экране: строка `flex-nowrap`, при нехватке места сначала
/// пропорционально ужимается префикс (не больше ~45% ширины), затем ник
/// обрезается многоточием; discriminator всегда виден целиком.
/// Префикс — один, по приоритету STAFF > MEDIA > DONATION (`identityPrefix`).
/// `previewable` — ник открывает превью профиля (ADR-0073). Полные значения —
/// в доступном имени, без нативного `title`.
export function UserIdentity({
  username,
  role,
  mediaBadges,
  tag,
  discriminator,
  prefixSize = 'xs',
  previewable = false,
  nameClassName,
  className,
}: {
  username: string;
  role?: DisplayableRole | null;
  /// Площадки медиа-партнёра: без префикса роли — медиа-префикс (ADR-0098).
  mediaBadges?: readonly string[] | null;
  /// Тег `ник#0000` — если discriminator не передан отдельно.
  tag?: string | null;
  discriminator?: string | null;
  prefixSize?: RolePrefixSize;
  previewable?: boolean;
  /// Размер/начертание ника (в шапке профиля — крупный заголовок).
  nameClassName?: string;
  className?: string;
}) {
  const prefix = identityPrefix(role, mediaBadges);
  const showPrefix = Boolean(prefix || role);
  const number = discriminator ?? discriminatorOf(tag);
  const full = number ? `${username}#${number}` : username;

  const nameText = (
    <>
      <span className="min-w-0 truncate">{username}</span>
      {number ? (
        <span className="shrink-0 font-normal tabular-nums text-subtle-foreground">#{number}</span>
      ) : null}
    </>
  );

  const name = previewable ? (
    <ProfilePreview username={username}>
      <button
        type="button"
        className={cn(
          'flex min-w-0 max-w-full items-baseline rounded-sm text-left text-sm font-medium text-foreground hover:underline',
          nameClassName,
        )}
        aria-label={`Профиль ${full}`}
      >
        {nameText}
      </button>
    </ProfilePreview>
  ) : (
    <span
      className={cn(
        'flex min-w-0 items-baseline text-sm font-medium text-foreground',
        nameClassName,
      )}
      data-testid="user-identity-name"
    >
      {nameText}
    </span>
  );

  return (
    <span
      className={cn('flex min-w-0 max-w-full flex-nowrap items-center gap-1.5', className)}
      data-testid="user-identity"
      data-context="user"
      data-context-username={username}
    >
      {showPrefix ? (
        <span className="flex min-w-0 max-w-[45%] shrink-0">
          <RolePrefix role={role} prefix={prefix} size={prefixSize} />
        </span>
      ) : null}
      {name}
    </span>
  );
}
