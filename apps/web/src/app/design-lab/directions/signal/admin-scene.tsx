'use client';

import {
  Ban,
  Bell,
  ChevronDown,
  ChevronRight,
  Download,
  Ellipsis,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  Server,
  Settings,
  Shield,
  ShoppingBag,
  SlidersHorizontal,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button, IconButton } from '@/components/ui/button';
import { Checkbox, CheckboxField, type CheckedState } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState, ForbiddenState } from '@/components/ui/error-state';
import { Field } from '@/components/ui/field';
import { UserHoverCard } from '@/components/ui/hover-card';
import { Input, Textarea } from '@/components/ui/input';
import { Pagination, PaginationSummary } from '@/components/ui/pagination';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ResizableSidebar } from '@/components/ui/resizable';
import { RolePrefix } from '@/components/ui/role-prefix';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { SwitchField } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type SortDirection,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { HelpTooltip, Tooltip } from '@/components/ui/tooltip';
import { Toggletip } from '@/components/ui/toggletip';
import { cn } from '@/lib/cn';
import { formatDate, formatNumber } from '@/lib/format';
import { useIsMobile } from '@/lib/use-media-query';
import {
  demoPermissionsByModule,
  demoServers,
  demoStats,
  demoUsers,
  type DemoUser,
} from '../../demo-data';
import type { ShowcaseProps } from '../registry';
import { coarseTarget, InstrumentLine, LiveDot, PanelHeading, roleOf, wait } from './shared';

/* ---------- Навигация ---------- */

interface NavLeaf {
  id: string;
  label: string;
  count?: number;
}

interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  children?: NavLeaf[];
}

const ADMIN_NAV: NavGroup[] = [
  { id: 'dashboard', label: 'Дашборд', icon: LayoutDashboard },
  {
    id: 'users',
    label: 'Пользователи',
    icon: Users,
    children: [
      { id: 'users.all', label: 'Все пользователи' },
      { id: 'users.roles', label: 'Роли' },
      { id: 'users.bans', label: 'Баны', count: demoStats.usersBanned },
    ],
  },
  {
    id: 'moderation',
    label: 'Модерация',
    icon: Shield,
    children: [
      { id: 'moderation.reports', label: 'Обращения', count: demoStats.pendingReports },
      {
        id: 'moderation.comments',
        label: 'Жалобы на комментарии',
        count: demoStats.pendingCommentReports,
      },
      {
        id: 'moderation.profiles',
        label: 'Жалобы на профили',
        count: demoStats.pendingProfileReports,
      },
    ],
  },
  {
    id: 'content',
    label: 'Контент',
    icon: FileText,
    children: [
      { id: 'content.news', label: 'Новости' },
      { id: 'content.events', label: 'События' },
      { id: 'content.pages', label: 'Страницы' },
    ],
  },
  {
    id: 'store',
    label: 'Магазин',
    icon: ShoppingBag,
    children: [
      { id: 'store.products', label: 'Товары' },
      { id: 'store.orders', label: 'Заказы' },
    ],
  },
  {
    id: 'servers',
    label: 'Сервера',
    icon: Server,
    children: [
      { id: 'servers.list', label: 'Список' },
      { id: 'servers.status', label: 'Статус' },
    ],
  },
  {
    id: 'system',
    label: 'Система',
    icon: Settings,
    children: [
      { id: 'system.settings', label: 'Настройки' },
      { id: 'system.audit', label: 'Аудит' },
    ],
  },
];

const navItemClassName = cn(
  'flex h-8 w-full items-center gap-2 border-l-2 border-transparent pr-3 text-sm text-muted-foreground',
  'transition-colors duration-fast hover:bg-muted hover:text-foreground',
  coarseTarget,
);

interface AdminNavProps {
  active: string;
  onSelect: (id: string) => void;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}

/// Дерево разделов: группа — кнопка с chevron, пункт — ссылка; активный
/// пункт отмечен оранжевой рейкой слева (единственный оранжевый в сайдбаре).
function AdminNav({ active, onSelect, expanded, onToggle }: AdminNavProps) {
  return (
    <nav aria-label="Разделы админ-панели" className="flex h-full flex-col bg-surface">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <span className="text-sm font-semibold tracking-tight">TwoMC</span>
        <span className="font-mono text-xs text-subtle-foreground">admin</span>
      </div>
      <ul className="flex flex-col py-2">
        {ADMIN_NAV.map((group) => {
          const Icon = group.icon;
          if (!group.children) {
            return (
              <li key={group.id}>
                <a
                  href={`/admin/${group.id}`}
                  aria-current={active === group.id ? 'page' : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    onSelect(group.id);
                  }}
                  className={cn(
                    navItemClassName,
                    'pl-[10px]',
                    active === group.id && 'border-primary bg-muted font-medium text-foreground',
                  )}
                >
                  <Icon aria-hidden className="size-4 shrink-0" />
                  {group.label}
                </a>
              </li>
            );
          }
          const open = expanded.has(group.id);
          const containsActive = group.children.some((leaf) => leaf.id === active);
          return (
            <li key={group.id}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`signal-nav-${group.id}`}
                onClick={() => onToggle(group.id)}
                className={cn(
                  navItemClassName,
                  'pl-[10px]',
                  containsActive && !open && 'text-foreground',
                )}
              >
                <Icon aria-hidden className="size-4 shrink-0" />
                <span className="flex-1 text-left">{group.label}</span>
                <ChevronRight
                  aria-hidden
                  className={cn(
                    'size-3.5 text-subtle-foreground transition-transform duration-fast',
                    open && 'rotate-90',
                  )}
                />
              </button>
              {open ? (
                <ul id={`signal-nav-${group.id}`}>
                  {group.children.map((leaf) => (
                    <li key={leaf.id}>
                      <a
                        href={`/admin/${leaf.id.replace('.', '/')}`}
                        aria-current={active === leaf.id ? 'page' : undefined}
                        onClick={(event) => {
                          event.preventDefault();
                          onSelect(leaf.id);
                        }}
                        className={cn(
                          navItemClassName,
                          'pl-9',
                          active === leaf.id &&
                            'border-primary bg-muted font-medium text-foreground',
                        )}
                      >
                        <span className="flex-1 truncate">{leaf.label}</span>
                        {leaf.count !== undefined ? (
                          <span className="font-mono text-xs tabular text-subtle-foreground">
                            {formatNumber(leaf.count)}
                          </span>
                        ) : null}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ---------- Стат-карточки ---------- */

function StatCell({
  label,
  value,
  note,
  live = false,
}: {
  label: string;
  value: number;
  note: ReactNode;
  live?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 bg-surface p-3">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        {live ? <LiveDot /> : null}
        {label}
      </p>
      <p className="font-mono text-2xl font-medium leading-none tabular">{formatNumber(value)}</p>
      <p className="font-mono text-xs tabular text-subtle-foreground">{note}</p>
    </div>
  );
}

function StatsRow() {
  return (
    <section
      aria-label="Сводка"
      className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border bg-border lg:grid-cols-4"
    >
      <StatCell
        label="Пользователи"
        value={demoStats.usersTotal}
        note={`+${demoStats.usersNewToday} сегодня`}
      />
      <StatCell
        label="Онлайн"
        value={demoStats.usersOnline}
        note={`${demoServers.filter((server) => server.online).length} из ${demoServers.length} серверов`}
        live
      />
      <StatCell label="Забанены" value={demoStats.usersBanned} note="за всё время" />
      <StatCell
        label="Обращения"
        value={demoStats.pendingReports}
        note={`${demoStats.pendingCommentReports} комментарии · ${demoStats.pendingProfileReports} профиль`}
      />
    </section>
  );
}

/* ---------- Таблица пользователей ---------- */

type SortKey = 'username' | 'playtimeHours' | 'joinedAt';
type Segment = 'all' | 'online' | 'banned';
type RoleFilter = 'all' | 'player' | 'vip' | 'staff';

const SEGMENTS = [
  { value: 'all', label: 'Все' },
  { value: 'online', label: 'Онлайн' },
  { value: 'banned', label: 'Забанены' },
];

const PAGE_SIZE = 8;

function userStatus(user: DemoUser): 'blocked' | 'online' | 'offline' {
  if (user.banned) {
    return 'blocked';
  }
  return user.online ? 'online' : 'offline';
}

function matchesRole(user: DemoUser, filter: RoleFilter): boolean {
  switch (filter) {
    case 'player':
      return user.role === 'Игрок';
    case 'vip':
      return user.role === 'VIP';
    case 'staff':
      return user.role !== 'Игрок' && user.role !== 'VIP';
    default:
      return true;
  }
}

function nextDirection(current: SortDirection): SortDirection {
  if (current === null) {
    return 'asc';
  }
  return current === 'asc' ? 'desc' : null;
}

interface UsersTableProps {
  onBan: (user: DemoUser) => void;
}

function UsersTable({ onBan }: UsersTableProps) {
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState<Segment>('all');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'playtimeHours',
    direction: 'desc',
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nickname, setNickname] = useState('');

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = demoUsers.filter((user) => {
      if (needle && !user.username.toLowerCase().includes(needle)) {
        return false;
      }
      if (segment === 'online' && !user.online) {
        return false;
      }
      if (segment === 'banned' && !user.banned) {
        return false;
      }
      return matchesRole(user, roleFilter);
    });
    if (sort.direction === null) {
      return filtered;
    }
    const sign = sort.direction === 'asc' ? 1 : -1;
    return filtered.toSorted((a, b) => {
      const left = a[sort.key];
      const right = b[sort.key];
      if (typeof left === 'number' && typeof right === 'number') {
        return (left - right) * sign;
      }
      return String(left).localeCompare(String(right), 'ru') * sign;
    });
  }, [query, segment, roleFilter, sort]);

  const allSelected = rows.length > 0 && rows.every((user) => selected.has(user.id));
  const someSelected = rows.some((user) => selected.has(user.id));
  const headerChecked: CheckedState = allSelected ? true : someSelected ? 'indeterminate' : false;

  const toggleAll = () => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (allSelected) {
        rows.forEach((user) => next.delete(user.id));
      } else {
        rows.forEach((user) => next.add(user.id));
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const onSort = (key: SortKey) => {
    setSort((previous) => ({
      key,
      direction: previous.key === key ? nextDirection(previous.direction) : 'asc',
    }));
  };

  const directionFor = (key: SortKey): SortDirection => (sort.key === key ? sort.direction : null);

  const resetFilters = () => {
    setQuery('');
    setSegment('all');
    setRoleFilter('all');
  };

  const saveUser = async () => {
    setSaving(true);
    await wait(600);
    setSaving(false);
    setAddOpen(false);
    toast.success('Пользователь добавлен', { description: nickname || 'Без ника' });
    setNickname('');
  };

  const firstSelected = demoUsers.find((user) => selected.has(user.id));

  return (
    <section
      aria-labelledby="signal-users-title"
      className="flex flex-col overflow-hidden rounded-sm border bg-surface"
    >
      <PanelHeading
        title={<span id="signal-users-title">Пользователи</span>}
        aside={
          <InstrumentLine
            items={[
              `${formatNumber(demoStats.usersTotal)} всего`,
              `${formatNumber(rows.length)} в выборке`,
              selected.size > 0 ? `${formatNumber(selected.size)} выбрано` : null,
            ].filter((item): item is string => item !== null)}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-2 border-b p-2">
        <div className="w-full sm:w-56">
          <Input
            size="sm"
            leading={<Search />}
            placeholder="Ник игрока"
            aria-label="Поиск по нику"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as RoleFilter)}>
          <SelectTrigger size="sm" aria-label="Роль" className="w-full sm:w-40">
            <SelectValue placeholder="Роль" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все роли</SelectItem>
            <SelectItem value="player">Игрок</SelectItem>
            <SelectItem value="vip">VIP</SelectItem>
            <SelectItem value="staff">Команда проекта</SelectItem>
          </SelectContent>
        </Select>
        <SegmentedControl
          size="md"
          aria-label="Статус"
          options={SEGMENTS}
          value={segment}
          onValueChange={(value) => {
            setSegment(value as Segment);
            setPage(1);
          }}
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <SlidersHorizontal />
              Фильтры
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 rounded-sm p-3">
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                toast.message('Фильтры применены');
              }}
            >
              <Field label="Сервер">
                <Select defaultValue={demoServers[0].slug}>
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {demoServers.map((server) => (
                      <SelectItem key={server.id} value={server.slug}>
                        {server.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Наиграно от, часов" hint="Пусто — без ограничения">
                <Input size="sm" type="number" inputMode="numeric" min={0} className="font-mono" />
              </Field>
              <CheckboxField label="Только с нарушениями" wrapperClassName="py-1" />
              <div className="flex justify-end gap-2 border-t pt-3">
                <PopoverClose asChild>
                  <Button variant="ghost" size="sm" onClick={resetFilters}>
                    Сбросить
                  </Button>
                </PopoverClose>
                <PopoverClose asChild>
                  <Button size="sm" type="submit">
                    Применить
                  </Button>
                </PopoverClose>
              </div>
            </form>
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm">
                Действия
                <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                {selected.size > 0
                  ? `Выбрано: ${formatNumber(selected.size)}`
                  : 'Выберите строки в таблице'}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  toast.success('Экспорт запущен', {
                    description: 'Файл придёт в уведомления через минуту.',
                  })
                }
              >
                <Download />
                Экспорт CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={selected.size === 0}
                onSelect={() =>
                  toast.message('Выдача роли', { description: 'Демо: форма не открывается.' })
                }
              >
                <Shield />
                Выдать роль
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={!firstSelected}
                onSelect={() => {
                  if (firstSelected) {
                    onBan(firstSelected);
                  }
                }}
              >
                <Ban />
                Забанить
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus />
            Добавить пользователя
          </Button>
        </div>
      </div>

      <Table sticky containerClassName="max-h-[420px] rounded-none border-0">
        <TableHeader>
          <TableRow className="h-9">
            <TableHead className="w-10 pl-3">
              <Checkbox
                aria-label="Выбрать все строки"
                checked={headerChecked}
                onCheckedChange={toggleAll}
              />
            </TableHead>
            <TableHead
              sortable
              sortDirection={directionFor('username')}
              onSort={() => onSort('username')}
              className="min-w-56"
            >
              Пользователь
            </TableHead>
            <TableHead>Роль</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead
              numeric
              sortable
              sortDirection={directionFor('playtimeHours')}
              onSort={() => onSort('playtimeHours')}
            >
              Наиграно
            </TableHead>
            <TableHead
              sortable
              sortDirection={directionFor('joinedAt')}
              onSort={() => onSort('joinedAt')}
            >
              Регистрация
            </TableHead>
            <TableHead className="w-12 pr-3">
              <span className="sr-only">Действия</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={7} className="p-0">
                <EmptyState
                  size="sm"
                  icon={<Users />}
                  title="Никого не найдено"
                  description="Измените запрос или сбросьте фильтры."
                  action={
                    <Button variant="secondary" size="sm" onClick={resetFilters}>
                      Сбросить фильтры
                    </Button>
                  }
                />
              </TableCell>
            </TableRow>
          ) : (
            rows.map((user) => {
              const role = roleOf(user);
              const isSelected = selected.has(user.id);
              return (
                <TableRow key={user.id} selected={isSelected}>
                  <TableCell className="pl-3">
                    <Checkbox
                      aria-label={`Выбрать ${user.username}`}
                      checked={isSelected}
                      onCheckedChange={() => toggleOne(user.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar name={user.username} src={user.avatar} size="xs" shape="square" />
                      <RolePrefix role={role} size="xs" />
                      <UserHoverCard
                        username={user.username}
                        tag={<span className="font-mono tabular">{user.tag}</span>}
                        role={user.role}
                        roleColor={user.roleColor}
                        online={user.online}
                        avatar={user.avatar}
                        description={`Наиграно ${formatNumber(user.playtimeHours)} ч · на проекте с ${formatDate(user.joinedAt)}`}
                      >
                        <a
                          href={`/admin/users/${user.id}`}
                          className="truncate font-medium hover:underline underline-offset-4"
                        >
                          {user.username}
                        </a>
                      </UserHoverCard>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge color={user.roleColor}>{user.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={userStatus(user)} />
                  </TableCell>
                  <TableCell numeric className="font-mono text-xs">
                    {formatNumber(user.playtimeHours)} ч
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs tabular text-muted-foreground">
                    {formatDate(user.joinedAt)}
                  </TableCell>
                  <TableCell className="pr-3">
                    <DropdownMenu>
                      <Tooltip content="Действия">
                        <DropdownMenuTrigger asChild>
                          <IconButton aria-label={`Действия: ${user.username}`} size="sm">
                            <Ellipsis />
                          </IconButton>
                        </DropdownMenuTrigger>
                      </Tooltip>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() =>
                            toast.message(user.username, {
                              description: 'Демо: переход не выполняется.',
                            })
                          }
                        >
                          <User />
                          Открыть профиль
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            toast.message('Выдача роли', {
                              description: 'Демо: форма не открывается.',
                            })
                          }
                        >
                          <Shield />
                          Выдать роль
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={user.banned}
                          onSelect={() => onBan(user)}
                        >
                          <Ban />
                          Забанить
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t p-2">
        <PaginationSummary page={page} limit={PAGE_SIZE} total={demoStats.usersTotal} />
        <Pagination
          size="sm"
          page={page}
          totalPages={Math.ceil(demoStats.usersTotal / PAGE_SIZE)}
          onPageChange={setPage}
        />
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent size="sm" className="rounded-sm">
          <DialogHeader>
            <DialogTitle>Добавить пользователя</DialogTitle>
            <DialogDescription>Ник должен совпадать с ником в игре.</DialogDescription>
          </DialogHeader>
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              void saveUser();
            }}
          >
            <DialogBody className="flex flex-col gap-4">
              <Field label="Ник" required hint="3–16 символов: латиница, цифры, подчёркивание">
                <Input
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="Steve_Mainer"
                  autoComplete="off"
                  className="font-mono"
                />
              </Field>
              <Field label="Роль">
                <Select defaultValue="player">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="player">Игрок</SelectItem>
                    <SelectItem value="vip">VIP</SelectItem>
                    <SelectItem value="helper">Хелпер</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <SwitchField
                label="Уведомить игрока в игре"
                description="Сообщение придёт при следующем входе."
                defaultChecked
              />
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary" disabled={saving}>
                  Отмена
                </Button>
              </DialogClose>
              <Button type="submit" loading={saving}>
                Сохранить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ---------- Состояния ---------- */

function StateCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col bg-surface">
      <p className="h-8 border-b px-3 font-mono text-xs leading-8 text-subtle-foreground">
        {label}
      </p>
      <div className="flex min-h-48 flex-1 flex-col justify-center">{children}</div>
    </div>
  );
}

function StatesRow() {
  return (
    <section
      aria-label="Состояния"
      className="grid gap-px overflow-hidden rounded-sm border bg-border md:grid-cols-2 xl:grid-cols-4"
    >
      <StateCell label="loading">
        <SkeletonRows rows={4} />
      </StateCell>
      <StateCell label="empty">
        <EmptyState
          size="sm"
          icon={<Users />}
          title="Обращений нет"
          description="Новые жалобы появятся здесь сразу после отправки."
          action={
            <Button variant="secondary" size="sm" onClick={() => toast.message('Список обновлён')}>
              Обновить
            </Button>
          }
        />
      </StateCell>
      <StateCell label="error">
        <ErrorState
          size="sm"
          description="Сервер аудита не ответил за 10 с. Повторите запрос."
          onRetry={() => toast.message('Повторяем запрос…')}
        />
      </StateCell>
      <StateCell label="forbidden">
        <ForbiddenState
          className="min-h-0 gap-2 p-6"
          requiredPermissions={demoPermissionsByModule.users.slice(1, 3)}
        />
      </StateCell>
    </section>
  );
}

/* ---------- Контролы ---------- */

function ControlsRow() {
  return (
    <section aria-label="Контролы" className="overflow-hidden rounded-sm border bg-surface">
      <PanelHeading title="Контролы" />
      <div className="grid gap-px bg-border lg:grid-cols-2">
        <div className="flex flex-col gap-3 bg-surface p-3">
          <p className="font-mono text-xs text-subtle-foreground">buttons · variants</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button>Сохранить</Button>
            <Button variant="secondary">Отмена</Button>
            <Button variant="outline">Экспорт</Button>
            <Button variant="ghost">Подробнее</Button>
            <Button variant="destructive">Удалить</Button>
            <Button variant="destructive-outline">Снять роль</Button>
            <Button variant="link">Открыть правила</Button>
          </div>
          <p className="font-mono text-xs text-subtle-foreground">
            buttons · sizes, loading, disabled
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Применить</Button>
            <Button size="md">Применить</Button>
            <Button size="lg">Применить</Button>
            <Tooltip content="Обновить данные" shortcut={['R']}>
              <IconButton aria-label="Обновить данные" variant="outline">
                <RefreshCw />
              </IconButton>
            </Tooltip>
            <Button loading>Сохраняем</Button>
            <Button disabled>Недоступно</Button>
            <Button variant="secondary" disabled>
              Недоступно
            </Button>
          </div>
          <p className="font-mono text-xs text-subtle-foreground">tabs · toggletip</p>
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview" className="h-control-sm">
                Обзор
              </TabsTrigger>
              <TabsTrigger
                value="permissions"
                count={demoPermissionsByModule.users.length}
                className="h-control-sm"
              >
                Права
              </TabsTrigger>
              <TabsTrigger value="audit" icon={<ScrollText />} className="h-control-sm">
                Аудит
              </TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="text-sm text-muted-foreground">
              Общие сведения о роли: название, приоритет, цвет.
            </TabsContent>
            <TabsContent value="permissions">
              <ul className="flex flex-wrap gap-1">
                {demoPermissionsByModule.users.map((permission) => (
                  <li key={permission}>
                    <code className="rounded-sm border bg-surface-sunken px-1.5 py-0.5 font-mono text-xs">
                      {permission}
                    </code>
                  </li>
                ))}
              </ul>
            </TabsContent>
            <TabsContent
              value="audit"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              Последнее изменение прав — вчера, 21:03.
              <Toggletip content="Полная история — в разделе «Система → Аудит». Хранится 90 дней." />
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex flex-col gap-3 bg-surface p-3">
          <p className="font-mono text-xs text-subtle-foreground">input · select · switch</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ник">
              <Input placeholder="Steve_Mainer" />
            </Field>
            <Field label="Поиск">
              <Input leading={<Search />} placeholder="Ник или тег" />
            </Field>
            <Field label="Ник" error="Ник уже занят — выберите другой." required>
              <Input defaultValue="Steve_Mainer" />
            </Field>
            <Field label="UUID" hint="Выдаётся сервером">
              <Input defaultValue="4a2b-…" disabled className="font-mono" />
            </Field>
            <Field
              label="Сервер"
              labelAddon={<HelpTooltip content="Сервер, на котором действует роль." />}
            >
              <Select defaultValue={demoServers[0].slug}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {demoServers.map((server) => (
                    <SelectItem key={server.id} value={server.slug} disabled={!server.online}>
                      {server.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Причина">
              <Textarea rows={2} placeholder="Коротко: что нарушено и где" />
            </Field>
          </div>
          <div className="divide-y divide-border-subtle border-t">
            <SwitchField
              label="Автообновление таблицы"
              description="Каждые 30 секунд, пока вкладка активна."
              defaultChecked
            />
            <CheckboxField label="Показывать офлайн-игроков" defaultChecked />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Сцена ---------- */

export function AdminScene({ theme }: ShowcaseProps) {
  const isMobile = useIsMobile();
  const [active, setActive] = useState('users.all');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['users', 'moderation']));
  const [menuOpen, setMenuOpen] = useState(false);
  const [banTarget, setBanTarget] = useState<DemoUser | null>(null);

  const toggleGroup = (id: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectItem = (id: string) => {
    setActive(id);
    setMenuOpen(false);
  };

  const navProps = { active, onSelect: selectItem, expanded, onToggle: toggleGroup };

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <ResizableSidebar
        sidebar={<AdminNav {...navProps} />}
        collapsed={isMobile}
        defaultWidth={240}
        minWidth={200}
        maxWidth={320}
        sidebarClassName="border-r"
      >
        <div className="flex min-w-0 flex-col">
          <div className="flex h-12 items-center gap-2 border-b bg-surface px-2 sm:px-3">
            <IconButton
              aria-label="Открыть разделы"
              size="sm"
              className="md:hidden"
              onClick={() => setMenuOpen(true)}
            >
              <Menu />
            </IconButton>
            <Breadcrumbs
              className="min-w-0 flex-1"
              items={[
                { label: 'Админ-панель', href: '/admin' },
                { label: 'Пользователи', href: '/admin/users' },
                { label: 'Все пользователи' },
              ]}
            />
            <div className="hidden w-56 lg:block">
              <Input
                size="sm"
                leading={<Search />}
                placeholder="Найти пользователя"
                aria-label="Поиск по админ-панели"
              />
            </div>
            <Tooltip content="Уведомления">
              <IconButton aria-label="Уведомления" size="sm">
                <Bell />
              </IconButton>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Аккаунт: younaxo_"
                  className={cn(
                    'inline-flex size-[var(--control-h-sm)] items-center justify-center rounded-sm hover:bg-muted',
                    '[@media(pointer:coarse)]:size-10',
                  )}
                >
                  <Avatar name="younaxo_" src={demoUsers[4].avatar} size="xs" shape="square" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="font-mono tabular">
                  {demoUsers[4].tag}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => toast.message('Профиль', { description: 'Демо.' })}
                >
                  <User />
                  Профиль
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => toast.message('Выход', { description: 'Демо.' })}>
                  <LogOut />
                  Выйти
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex flex-col gap-3 p-3">
            <StatsRow />
            <UsersTable onBan={setBanTarget} />
            <StatesRow />
            <ControlsRow />
          </div>

          <div className="flex h-8 items-center border-t bg-surface px-3">
            <InstrumentLine
              items={[
                `тема: ${theme === 'dark' ? 'тёмная' : 'светлая'}`,
                `${formatNumber(demoStats.usersOnline)} онлайн`,
                'данные: демо',
              ]}
            />
          </div>
        </div>
      </ResizableSidebar>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" size="sm" className="p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Разделы админ-панели</SheetTitle>
          </SheetHeader>
          <SheetBody className="p-0">
            <AdminNav {...navProps} />
          </SheetBody>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={banTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setBanTarget(null);
          }
        }}
        title="Забанить пользователя"
        description={
          banTarget
            ? `${banTarget.username} потеряет доступ ко всем серверам. Бан можно снять в карточке пользователя.`
            : undefined
        }
        confirmLabel="Забанить"
        destructive
        onConfirm={async () => {
          await wait(600);
          toast.success('Пользователь забанен', { description: banTarget?.username });
        }}
      >
        <Field label="Причина" required hint="Игрок увидит её при попытке входа">
          <Textarea rows={2} placeholder="Читы на Survival #1" />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
