'use client';

import { ROLE_PREFIXES } from '@twomc/shared';
import { ProfilePreviewCard } from '@/components/profile/profile-preview';
import { RolePrefix, UserRolesInline } from '@/components/ui/role-prefix';
import { UserIdentity } from '@/components/ui/user-identity';
import { getRolePrefixAsset } from '@/lib/roles/primary-role';

const multiRoleUser = [
  { slug: 'developer', priority: 300, displayName: 'Developer' },
  { slug: 'chief-curator', priority: 900, displayName: 'Chief Curator' },
  { slug: 'project-team', priority: 200, displayName: 'Project Team' },
];

/// Секция дизайн-системы: все официальные PNG-префиксы ролей, размеры,
/// пример рядом с ником и поведение fallback. Не галерея — справочник.
export function RolePrefixesSection() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-surface p-card-p">
          <p className="text-sm font-medium">Размеры</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Исходник 7px, масштаб только целочисленный: xs 14px — таблицы и чат; sm 21px —
            комментарии и строки пользователей; md 28px — hover card и карточка; lg 42px — шапка
            профиля и admin-превью роли.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
              <div key={size} className="flex items-center gap-3">
                <span className="w-6 font-mono text-xs text-subtle-foreground">{size}</span>
                <RolePrefix slug="moderator" name="Moderator" size={size} tooltip={false} />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border bg-surface p-card-p">
          <p className="text-sm font-medium">Несколько ролей у пользователя</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Рядом с ником — одна основная роль: старшая по priority из имеющих префикс. Полный
            список — только в подробном профиле.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <UserRolesInline roles={multiRoleUser} size="xs" />
              <span className="font-medium">younaxo_</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Профиль:</span>
              <UserRolesInline roles={multiRoleUser} size="sm" showSecondary />
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-surface p-card-p">
          <p className="text-sm font-medium">Fallback</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Роль без PNG, неизвестный slug или ошибка загрузки → текстовый бейдж с цветом роли.
            Битой картинки не бывает. Права на это не влияют — только RBAC backend.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <RolePrefix
              role={{ slug: 'vip', priority: 50, displayName: 'VIP', color: '#F26A1B' }}
            />
            <RolePrefix slug="unknown-role" name="Неизвестная роль" />
            <RolePrefix slug="player" name="Игрок" />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-surface scrollbar-thin">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b bg-surface-sunken text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Роль</th>
              <th className="px-3 py-2 font-medium">slug</th>
              <th className="px-3 py-2 font-medium">PNG (sm)</th>
              <th className="px-3 py-2 font-medium">md</th>
              <th className="px-3 py-2 font-medium">Рядом с ником</th>
              <th className="px-3 py-2 text-right font-medium">Исходник</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {ROLE_PREFIXES.map((prefix) => {
              const asset = getRolePrefixAsset(prefix.slug);
              return (
                <tr key={prefix.slug} className="hover:bg-muted/50">
                  <td className="px-3 py-2 font-medium">{prefix.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {prefix.slug}
                  </td>
                  <td className="px-3 py-2">
                    <RolePrefix slug={prefix.slug} name={prefix.name} size="sm" tooltip={false} />
                  </td>
                  <td className="px-3 py-2">
                    <RolePrefix slug={prefix.slug} name={prefix.name} size="md" tooltip={false} />
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-2">
                      <RolePrefix slug={prefix.slug} name={prefix.name} size="xs" />
                      <span>Steve_Mainer</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular text-subtle-foreground">
                    {asset ? `${asset.width}×7` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-sm">
          <p className="text-sm font-medium">UserIdentity — длинные ник и роль</p>
          <div className="w-56">
            <UserIdentity
              username="very_long_name16"
              tag="very_long_name16#a1b2"
              role={{ slug: 'chief-curator', displayName: 'Главный куратор', priority: 90 }}
            />
          </div>
          <div className="w-56">
            <UserIdentity
              username="very_long_name16"
              variant="inline"
              role={{ slug: 'chief-curator', displayName: 'Главный куратор', priority: 90 }}
            />
          </div>
          <p className="text-xs text-subtle-foreground">
            stacked — префикс над ником; inline — префикс сжимается пропорционально, ник обрезается
            многоточием (полное значение в title).
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-sm">
          <p className="text-sm font-medium">Превью профиля (пример данных)</p>
          <div className="w-80 rounded-lg bg-surface-overlay p-4 shadow-lg">
            <ProfilePreviewCard
              username="player"
              loading={false}
              error={false}
              summary={{
                username: 'player',
                hidden: false,
                tag: 'player#0001',
                avatar: null,
                createdAt: '2025-03-01T10:00:00.000Z',
                system: false,
                banned: false,
                position: { displayName: 'Игрок', color: '#a3a3a3' },
                roles: [
                  {
                    slug: 'chief-curator',
                    displayName: 'Главный куратор',
                    priority: 90,
                    color: null,
                  },
                ],
                online: true,
                currentServer: 'Выживание',
                lastActivityAt: null,
                statistics: { playTimeMinutes: 185, kills: 12, deaths: 4, killDeathRatio: 3 },
                statisticsHidden: false,
                friendsCount: 7,
                achievementsCompleted: 15,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
