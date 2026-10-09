'use client';

import { ProfilePreview } from '@/components/profile/profile-preview';
import { cn } from '@/lib/cn';
import type { DisplayableRole } from '@/lib/roles/primary-role';
import { RolePrefix, type RolePrefixSize } from './role-prefix';

/// Префикс роли + ник + (опционально) тег.
/// - `stacked` (по умолчанию) — префикс отдельной строкой над ником (сайдбар,
///   меню аккаунта): ничего не перекрывает и не «съедает» ширину ника.
/// - `inline` — префикс и ник в одну строку (таблицы, списки): длинный префикс
///   сжимается пропорционально (не больше ~45% ширины), ник обрезается.
/// Длинные ник/тег — многоточие, полное значение в title. `previewable` —
/// ник открывает превью профиля (ADR-0073).
export function UserIdentity({
  username,
  role,
  tag,
  prefixSize = 'xs',
  variant = 'stacked',
  previewable = false,
  className,
}: {
  username: string;
  role?: DisplayableRole | null;
  tag?: string | null;
  prefixSize?: RolePrefixSize;
  variant?: 'stacked' | 'inline';
  previewable?: boolean;
  className?: string;
}) {
  const name = previewable ? (
    <ProfilePreview username={username}>
      <button
        type="button"
        className="block min-w-0 max-w-full truncate rounded-sm text-left text-sm font-medium text-foreground hover:underline"
        title={username}
        aria-label={`Профиль ${username}`}
      >
        {username}
      </button>
    </ProfilePreview>
  ) : (
    <span className="block min-w-0 truncate text-sm font-medium text-foreground" title={username}>
      {username}
    </span>
  );

  if (variant === 'inline') {
    return (
      <span
        className={cn('flex min-w-0 items-center gap-1.5', className)}
        data-testid="user-identity"
        data-variant="inline"
        data-context="user"
        data-context-username={username}
      >
        {role ? (
          <span className="flex min-w-0 max-w-[45%] shrink">
            <RolePrefix role={role} size={prefixSize} />
          </span>
        ) : null}
        <span className="min-w-0 flex-1">{name}</span>
      </span>
    );
  }

  return (
    <span
      className={cn('flex min-w-0 flex-col gap-0.5', className)}
      data-testid="user-identity"
      data-context="user"
      data-context-username={username}
    >
      {role ? (
        <span className="flex min-w-0 max-w-full overflow-hidden">
          <RolePrefix role={role} size={prefixSize} />
        </span>
      ) : null}
      {name}
      {tag ? (
        <span
          className="block min-w-0 truncate font-mono text-xs text-subtle-foreground"
          title={tag}
        >
          {tag}
        </span>
      ) : null}
    </span>
  );
}
