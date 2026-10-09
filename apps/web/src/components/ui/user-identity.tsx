import { cn } from '@/lib/cn';
import type { DisplayableRole } from '@/lib/roles/primary-role';
import { RolePrefix, type RolePrefixSize } from './role-prefix';

/// Префикс роли + ник + (опционально) тег в узких местах (сайдбар, меню
/// аккаунта). Префикс — отдельной строкой над ником в обычном потоке, ничего
/// не перекрывает и не «съедает» ширину ника; длинные ник/тег обрезаются
/// многоточием, полное значение — в title.
export function UserIdentity({
  username,
  role,
  tag,
  prefixSize = 'xs',
  className,
}: {
  username: string;
  role?: DisplayableRole | null;
  tag?: string | null;
  prefixSize?: RolePrefixSize;
  className?: string;
}) {
  return (
    <span className={cn('flex min-w-0 flex-col gap-0.5', className)} data-testid="user-identity">
      {role ? (
        <span className="flex min-w-0 max-w-full overflow-hidden">
          <RolePrefix role={role} size={prefixSize} />
        </span>
      ) : null}
      <span className="block min-w-0 truncate text-sm font-medium text-foreground" title={username}>
        {username}
      </span>
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
