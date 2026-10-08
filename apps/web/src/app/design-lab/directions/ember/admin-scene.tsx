'use client';

import {
  Ban,
  Bell,
  Copy,
  Download,
  Gavel,
  Inbox,
  LayoutDashboard,
  Megaphone,
  Menu,
  MoreHorizontal,
  Newspaper,
  RefreshCw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { AnimatedCounter } from '@/components/ui/animated-counter';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState, ForbiddenState } from '@/components/ui/error-state';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Pagination, PaginationSummary } from '@/components/ui/pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RolePrefix } from '@/components/ui/role-prefix';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { NumberStepper } from '@/components/ui/stepper';
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
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { formatDate, formatNumber } from '@/lib/format';
import { demoPermissionsByModule, demoStats, demoUsers, type DemoUser } from '../../demo-data';
import {
  DEMO_NOW,
  formatHours,
  isStaff,
  pluralRu,
  RoleLabel,
  UserName,
  useLiveValue,
  wait,
} from './shared';

/* ------------------------------------ Данные ----------------------------------- */

interface AdminNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  count?: number;
}

const ADMIN_NAV: AdminNavItem[] = [
  { id: 'dashboard', label: 'Дашборд', icon: LayoutDashboard },
  { id: 'users', label: 'Пользователи', icon: Users },
  { id: 'moderation', label: 'Модерация', icon: Gavel, count: demoStats.pendingReports },
  { id: 'content', label: 'Контент', icon: Newspaper },
  { id: 'store', label: 'Магазин', icon: ShoppingBag },
  { id: 'servers', label: 'Сервера', icon: Server },
  { id: 'system', label: 'Система', icon: Settings },
];

const ACTIVE_NAV = 'users';
const ADMIN_USER = demoUsers[4];
const PAGE_SIZE = 5;

type SortKey = 'username' | 'playtime' | 'joined';
type Sort = { key: SortKey; direction: 'asc' | 'desc' } | null;
type Tab = 'all' | 'online' | 'staff' | 'banned';
type RoleFilter = 'all' | 'player' | 'vip' | 'staff';
type Period = 'all' | '30d' | '7d';
type Audience = 'all' | 'online' | 'staff';

const PERIOD_OPTIONS = [
  { value: 'all', label: 'Всё время' },
  { value: '30d', label: '30 дней' },
  { value: '7d', label: '7 дней' },
];

const AUDIENCE_SIZE: Record<Audience, number> = {
  all: demoStats.usersTotal,
  online: demoStats.usersOnline,
  staff: demoUsers.filter(isStaff).length,
};

const matchesTab = (user: DemoUser, tab: Tab): boolean => {
  switch (tab) {
    case 'online':
      return user.online && !user.banned;
    case 'staff':
      return isStaff(user);
    case 'banned':
      return user.banned === true;
    default:
      return true;
  }
};

const matchesRole = (user: DemoUser, role: RoleFilter): boolean => {
  switch (role) {
    case 'player':
      return user.role === 'Игрок';
    case 'vip':
      return user.role === 'VIP';
    case 'staff':
      return isStaff(user);
    default:
      return true;
  }
};

const matchesPeriod = (user: DemoUser, period: Period): boolean => {
  if (period === 'all') {
    return true;
  }
  const days = period === '30d' ? 30 : 7;
  return new Date(user.joinedAt).getTime() >= DEMO_NOW.getTime() - days * 86_400_000;
};

const compareUsers = (a: DemoUser, b: DemoUser, sort: Sort): number => {
  if (!sort) {
    return 0;
  }
  let result = 0;
  if (sort.key === 'username') {
    result = a.username.localeCompare(b.username, 'ru');
  } else if (sort.key === 'playtime') {
    result = a.playtimeHours - b.playtimeHours;
  } else {
    result = new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
  }
  return sort.direction === 'asc' ? result : -result;
};

/* ------------------------------------ Сцена ------------------------------------ */

export function AdminScene() {
  const [navOpen, setNavOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);

  return (
    <div className="flex min-h-[40rem] overflow-hidden rounded-lg border bg-background text-foreground">
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-surface lg:flex">
        <div className="flex h-12 items-center gap-2 border-b px-4">
          <span className="font-display font-semibold">TwoMC</span>
          <span className="text-xs text-muted-foreground">Админ-панель</span>
        </div>
        <AdminNav />
        <div className="mt-auto flex items-center gap-2 border-t px-3 py-3">
          <Avatar name={ADMIN_USER.username} src={ADMIN_USER.avatar} size="sm" shape="square" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{ADMIN_USER.username}</p>
            <RolePrefix slug="chief-curator" name={ADMIN_USER.role} size="xs" tooltip={false} />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center gap-2 border-b bg-surface px-3 md:px-4">
          <IconButton
            aria-label="Открыть разделы"
            size="sm"
            className="lg:hidden"
            onClick={() => setNavOpen(true)}
          >
            <Menu />
          </IconButton>
          <Breadcrumbs
            items={[{ label: 'Админ-панель', href: '#ember-admin' }, { label: 'Пользователи' }]}
            className="min-w-0 flex-1"
          />
          <div className="hidden w-56 md:block">
            <Input
              size="sm"
              leading={<Search />}
              placeholder="Поиск по админ-панели"
              aria-label="Поиск по админ-панели"
            />
          </div>
          <Tooltip content="Жалобы в очереди">
            <IconButton
              aria-label={`Уведомления, в очереди: ${formatNumber(demoStats.pendingReports)}`}
              size="sm"
              className="relative"
            >
              <Bell />
              <span
                aria-hidden
                className="absolute right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground tabular"
              >
                {demoStats.pendingReports}
              </span>
            </IconButton>
          </Tooltip>
          <Avatar name={ADMIN_USER.username} src={ADMIN_USER.avatar} size="sm" shape="square" />
        </header>

        <div className="flex flex-col gap-6 p-4 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h4 className="font-display text-2xl md:text-3xl">Пользователи</h4>
              <p className="mt-1 text-sm text-muted-foreground tabular">
                {pluralRu(demoStats.usersTotal, 'аккаунт', 'аккаунта', 'аккаунтов')},{' '}
                {formatNumber(demoStats.usersOnline)} онлайн
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  toast.info('Экспорт запущен', {
                    description: 'Ссылка на файл придёт в уведомления.',
                  })
                }
              >
                <Download aria-hidden />
                Экспорт
              </Button>
              <Button onClick={() => setBroadcastOpen(true)}>
                <Megaphone aria-hidden />
                Рассылка
              </Button>
            </div>
          </div>

          <StatTiles />
          <UsersPanel />
          <StatesRow />
          <ControlsRow />
        </div>
      </div>

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" size="sm">
          <SheetHeader>
            <SheetTitle className="font-display">Админ-панель</SheetTitle>
            <SheetDescription>Разделы</SheetDescription>
          </SheetHeader>
          <SheetBody className="px-0">
            <AdminNav onNavigate={() => setNavOpen(false)} />
          </SheetBody>
        </SheetContent>
      </Sheet>

      <BroadcastDialog open={broadcastOpen} onOpenChange={setBroadcastOpen} />
    </div>
  );
}

/* ----------------------------------- Сайдбар ----------------------------------- */

function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Разделы админ-панели" className="py-2">
      <ul className="flex flex-col">
        {ADMIN_NAV.map((item) => {
          const active = item.id === ACTIVE_NAV;
          return (
            <li key={item.id}>
              <Link
                href="#ember-admin"
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={cn(
                  'flex h-10 items-center gap-3 border-l-2 pl-3 pr-3 text-sm transition-colors duration-fast',
                  active
                    ? 'border-primary bg-primary-soft/30 font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <item.icon aria-hidden className="size-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.count !== undefined ? (
                  <Badge tone="warning" className="tabular">
                    {formatNumber(item.count)}
                  </Badge>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* --------------------------------- Stat-плитки --------------------------------- */

function StatTiles() {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-4">
      <StatTile label="Всего игроков" value={demoStats.usersTotal} />
      <StatTile label="Онлайн" value={demoStats.usersOnline} hot />
      <StatTile label="Новых сегодня" value={demoStats.usersNewToday} />
      <StatTile
        label="Жалобы в очереди"
        value={demoStats.pendingReports}
        note={`На комментарии: ${formatNumber(demoStats.pendingCommentReports)}, на профили: ${formatNumber(demoStats.pendingProfileReports)}`}
      />
    </dl>
  );
}

function StatTile({
  label,
  value,
  note,
  hot = false,
}: {
  label: string;
  value: number;
  note?: string;
  hot?: boolean;
}) {
  const live = useLiveValue(value);
  return (
    <div className="bg-surface p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'mt-1 font-display text-2xl leading-none tabular md:text-3xl',
          hot && 'text-primary',
        )}
      >
        <AnimatedCounter value={live} />
      </dd>
      {note ? <dd className="mt-2 text-xs text-subtle-foreground">{note}</dd> : null}
    </div>
  );
}

/* ------------------------------ Таблица пользователей ---------------------------- */

function UsersPanel() {
  const [rows, setRows] = useState(demoUsers);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<RoleFilter>('all');
  const [period, setPeriod] = useState<Period>('all');
  const [minHours, setMinHours] = useState(0);
  const [hideBanned, setHideBanned] = useState(false);
  const [sort, setSort] = useState<Sort>({ key: 'playtime', direction: 'desc' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [banTargets, setBanTargets] = useState<DemoUser[] | null>(null);
  const [banReason, setBanReason] = useState('');

  const counts = useMemo(
    () => ({
      all: rows.length,
      online: rows.filter((user) => matchesTab(user, 'online')).length,
      staff: rows.filter((user) => matchesTab(user, 'staff')).length,
      banned: rows.filter((user) => matchesTab(user, 'banned')).length,
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter(
        (user) =>
          matchesTab(user, tab) &&
          matchesRole(user, role) &&
          matchesPeriod(user, period) &&
          user.playtimeHours >= minHours &&
          (!hideBanned || !user.banned) &&
          (needle === '' ||
            user.username.toLowerCase().includes(needle) ||
            user.tag.toLowerCase().includes(needle)),
      )
      .toSorted((a, b) => compareUsers(a, b, sort));
  }, [rows, tab, query, role, period, minHours, hideBanned, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const pageIds = paged.map((user) => user.id);
  const selectedOnPage = pageIds.filter((id) => selected.has(id)).length;
  const headerChecked: CheckedState =
    paged.length > 0 && selectedOnPage === paged.length
      ? true
      : selectedOnPage > 0
        ? 'indeterminate'
        : false;

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (headerChecked === true) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const cycleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev?.key !== key) {
        return { key, direction: 'asc' };
      }
      return prev.direction === 'asc' ? { key, direction: 'desc' } : null;
    });
  };
  const directionOf = (key: SortKey): SortDirection => (sort?.key === key ? sort.direction : null);

  const unban = (user: DemoUser) => {
    setRows((prev) => prev.map((row) => (row.id === user.id ? { ...row, banned: false } : row)));
    toast.success(`${user.username} разбанен`);
  };

  const copyTag = async (user: DemoUser) => {
    try {
      await navigator.clipboard.writeText(user.tag);
      toast.success('Тег скопирован', { description: user.tag });
    } catch {
      toast.error('Не удалось скопировать', { description: 'Выделите тег вручную.' });
    }
  };

  const confirmBan = async () => {
    if (!banTargets) {
      return;
    }
    await wait(700);
    const ids = new Set(banTargets.map((user) => user.id));
    setRows((prev) =>
      prev.map((row) => (ids.has(row.id) ? { ...row, banned: true, online: false } : row)),
    );
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    const reason = banReason.trim();
    toast.success(
      banTargets.length === 1
        ? `${banTargets[0].username} забанен`
        : `Забанено: ${formatNumber(banTargets.length)}`,
      { description: reason ? `Причина: ${reason}` : undefined },
    );
    setBanReason('');
  };

  const banTitle =
    banTargets && banTargets.length > 1
      ? `Забанить ${pluralRu(banTargets.length, 'пользователя', 'пользователей', 'пользователей')}?`
      : 'Забанить пользователя?';
  const banDescription = banTargets
    ? `${banTargets.map((user) => user.username).join(', ')} ${
        banTargets.length === 1 ? 'потеряет' : 'потеряют'
      } доступ ко всем серверам и сайту. Бан можно снять в карточке игрока.`
    : undefined;

  return (
    <section aria-labelledby="ember-users-title" className="flex min-w-0 flex-col gap-4">
      <h5 id="ember-users-title" className="sr-only">
        Список пользователей
      </h5>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as Tab);
          setPage(1);
        }}
      >
        <TabsList>
          <TabsTrigger value="all" count={counts.all}>
            Все
          </TabsTrigger>
          <TabsTrigger value="online" count={counts.online}>
            Онлайн
          </TabsTrigger>
          <TabsTrigger value="staff" count={counts.staff}>
            Команда
          </TabsTrigger>
          <TabsTrigger value="banned" count={counts.banned}>
            Забанены
          </TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-64">
              <Input
                size="sm"
                leading={<Search />}
                placeholder="Ник или тег"
                aria-label="Поиск по нику или тегу"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Select
              value={role}
              onValueChange={(value) => {
                setRole(value as RoleFilter);
                setPage(1);
              }}
            >
              <SelectTrigger size="sm" aria-label="Роль" className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все роли</SelectItem>
                <SelectItem value="player">Игроки</SelectItem>
                <SelectItem value="vip">VIP</SelectItem>
                <SelectItem value="staff">Команда</SelectItem>
              </SelectContent>
            </Select>
            <SegmentedControl
              aria-label="Период регистрации"
              options={PERIOD_OPTIONS}
              value={period}
              onValueChange={(value) => {
                setPeriod(value as Period);
                setPage(1);
              }}
            />
            <ExtraFilters
              minHours={minHours}
              hideBanned={hideBanned}
              onApply={(next) => {
                setMinHours(next.minHours);
                setHideBanned(next.hideBanned);
                setPage(1);
              }}
            />
          </div>

          {selected.size > 0 ? (
            <div
              role="region"
              aria-label="Действия с выбранными"
              className="flex flex-wrap items-center gap-2 rounded border border-primary/30 bg-primary-soft/40 px-3 py-2 text-sm"
            >
              <span aria-live="polite" className="font-medium tabular">
                Выбрано: {formatNumber(selected.size)}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Снять выделение
              </Button>
              <Button
                variant="destructive-outline"
                size="sm"
                className="ml-auto"
                onClick={() =>
                  setBanTargets(rows.filter((user) => selected.has(user.id) && !user.banned))
                }
                disabled={!rows.some((user) => selected.has(user.id) && !user.banned)}
              >
                <Ban aria-hidden />
                Забанить выбранных
              </Button>
            </div>
          ) : null}

          <Table containerClassName="rounded-lg" className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Выбрать всех на странице"
                    checked={headerChecked}
                    onCheckedChange={toggleAll}
                    disabled={paged.length === 0}
                    className="flex"
                  />
                </TableHead>
                <TableHead
                  sortable
                  sortDirection={directionOf('username')}
                  onSort={() => cycleSort('username')}
                  className="min-w-[19rem]"
                >
                  Игрок
                </TableHead>
                <TableHead>Роль</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead
                  numeric
                  sortable
                  sortDirection={directionOf('playtime')}
                  onSort={() => cycleSort('playtime')}
                >
                  Наиграно
                </TableHead>
                <TableHead
                  sortable
                  sortDirection={directionOf('joined')}
                  onSort={() => cycleSort('joined')}
                >
                  Регистрация
                </TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Действия</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((user) => (
                <TableRow key={user.id} selected={selected.has(user.id)}>
                  <TableCell className="w-10">
                    <Checkbox
                      aria-label={`Выбрать ${user.username}`}
                      checked={selected.has(user.id)}
                      onCheckedChange={() => toggleRow(user.id)}
                      className="flex"
                    />
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2.5">
                      <Avatar name={user.username} src={user.avatar} size="xs" shape="square" />
                      <UserName user={user} />
                    </span>
                  </TableCell>
                  <TableCell>
                    <RoleLabel user={user} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={user.banned ? 'blocked' : user.online ? 'online' : 'offline'}
                    />
                  </TableCell>
                  <TableCell numeric>{formatHours(user.playtimeHours)}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground tabular">
                    <time dateTime={user.joinedAt}>{formatDate(user.joinedAt)}</time>
                  </TableCell>
                  <TableCell className="w-12">
                    <RowActions
                      user={user}
                      onBan={() => setBanTargets([user])}
                      onUnban={() => unban(user)}
                      onCopyTag={() => copyTag(user)}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {paged.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7}>
                    <EmptyState
                      size="sm"
                      icon={<Inbox />}
                      title="Никого не нашли"
                      description="Измените запрос или снимите фильтры."
                      action={
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setQuery('');
                            setRole('all');
                            setPeriod('all');
                            setMinHours(0);
                            setHideBanned(false);
                            setTab('all');
                            setPage(1);
                          }}
                        >
                          Сбросить фильтры
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <PaginationSummary page={currentPage} limit={PAGE_SIZE} total={filtered.length} />
            <Pagination
              size="sm"
              page={currentPage}
              totalPages={totalPages}
              onPageChange={setPage}
              label="Страницы списка пользователей"
              className="self-end sm:self-auto"
            />
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={banTargets !== null}
        onOpenChange={(open) => {
          if (!open) {
            setBanTargets(null);
            setBanReason('');
          }
        }}
        title={banTitle}
        description={banDescription}
        confirmLabel="Забанить"
        destructive
        onConfirm={confirmBan}
      >
        <Field label="Причина" hint="Игрок увидит её при попытке войти на сервер">
          <Textarea
            rows={3}
            value={banReason}
            onChange={(event) => setBanReason(event.target.value)}
            placeholder="Нарушение правил 3.2, читы"
          />
        </Field>
      </ConfirmDialog>
    </section>
  );
}

function ExtraFilters({
  minHours,
  hideBanned,
  onApply,
}: {
  minHours: number;
  hideBanned: boolean;
  onApply: (next: { minHours: number; hideBanned: boolean }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftHours, setDraftHours] = useState(minHours);
  const [draftHideBanned, setDraftHideBanned] = useState(hideBanned);
  const activeCount = (minHours > 0 ? 1 : 0) + (hideBanned ? 1 : 0);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onApply({ minHours: draftHours, hideBanned: draftHideBanned });
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraftHours(minHours);
          setDraftHideBanned(hideBanned);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal aria-hidden />
          Фильтры
          {activeCount > 0 ? (
            <Badge tone="primary" className="tabular">
              {activeCount}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Наиграно не меньше, часов" hint="0 — без ограничения">
            <NumberStepper
              size="sm"
              min={0}
              max={5000}
              step={100}
              value={draftHours}
              onValueChange={setDraftHours}
            />
          </Field>
          <CheckboxField
            label="Скрыть забаненных"
            checked={draftHideBanned}
            onCheckedChange={(value) => setDraftHideBanned(value === true)}
            wrapperClassName="py-0"
          />
          <div className="flex justify-end gap-2 border-t border-border-subtle pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraftHours(0);
                setDraftHideBanned(false);
              }}
            >
              Сбросить
            </Button>
            <Button type="submit" size="sm">
              Применить
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function RowActions({
  user,
  onBan,
  onUnban,
  onCopyTag,
}: {
  user: DemoUser;
  onBan: () => void;
  onUnban: () => void;
  onCopyTag: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton aria-label={`Действия: ${user.username}`} size="sm">
          <MoreHorizontal />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href="#ember-profile">
            <User aria-hidden />
            Открыть профиль
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onCopyTag}>
          <Copy aria-hidden />
          Скопировать тег
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {user.banned ? (
          <DropdownMenuItem onSelect={onUnban}>
            <ShieldCheck aria-hidden />
            Разбанить
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem variant="destructive" onSelect={onBan}>
            <Ban aria-hidden />
            Забанить
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------- Диалог рассылки ------------------------------- */

function BroadcastDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [pinned, setPinned] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (title.trim() === '') {
      setTitleError('Укажите заголовок — он будет виден в списке уведомлений.');
      return;
    }
    setSending(true);
    await wait(700);
    setSending(false);
    onOpenChange(false);
    toast.success('Рассылка отправлена', {
      description: `Получателей: ${formatNumber(AUDIENCE_SIZE[audience])}.`,
    });
    setTitle('');
    setMessage('');
    setPinned(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>Рассылка уведомления</DialogTitle>
            <DialogDescription>
              Придёт в личные уведомления на сайте выбранным игрокам.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field label="Заголовок" required error={titleError}>
              <Input
                value={title}
                placeholder="Техработы Anarchy до 20:00"
                onChange={(event) => {
                  setTitle(event.target.value);
                  if (titleError) {
                    setTitleError(null);
                  }
                }}
              />
            </Field>
            <Field label="Текст" hint="До 500 символов">
              <Textarea
                rows={4}
                value={message}
                maxLength={500}
                onChange={(event) => setMessage(event.target.value)}
              />
            </Field>
            <Select value={audience} onValueChange={(value) => setAudience(value as Audience)}>
              <Field label="Получатели">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
              </Field>
              <SelectContent>
                <SelectItem value="all">Все игроки, {formatNumber(AUDIENCE_SIZE.all)}</SelectItem>
                <SelectItem value="online">
                  Сейчас онлайн, {formatNumber(AUDIENCE_SIZE.online)}
                </SelectItem>
                <SelectItem value="staff">
                  Команда проекта, {formatNumber(AUDIENCE_SIZE.staff)}
                </SelectItem>
              </SelectContent>
            </Select>
            <CheckboxField
              label="Закрепить в шапке сайта"
              description="Будет видно всем до закрытия"
              checked={pinned}
              onCheckedChange={(value) => setPinned(value === true)}
              wrapperClassName="py-0"
            />
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={sending}>
                Отмена
              </Button>
            </DialogClose>
            <Button type="submit" loading={sending}>
              Отправить рассылку
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------- Состояния ---------------------------------- */

function StatesRow() {
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    setRetrying(true);
    await wait(900);
    setRetrying(false);
    toast.error('Список всё ещё недоступен', { description: 'Попробуйте через минуту.' });
  };

  return (
    <section aria-labelledby="ember-states-title" className="flex flex-col gap-3">
      <h5 id="ember-states-title" className="font-display text-lg">
        Состояния
      </h5>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StateBox label="Загрузка">
          <SkeletonRows rows={4} />
        </StateBox>
        <StateBox label="Пусто">
          <EmptyState
            size="sm"
            icon={<Inbox />}
            title="Жалоб нет"
            description="Новые жалобы игроков появятся здесь."
            action={
              <Button variant="secondary" size="sm" asChild>
                <Link href="#ember-admin">Открыть обращения</Link>
              </Button>
            }
          />
        </StateBox>
        <StateBox label="Ошибка">
          <ErrorState
            size="sm"
            title="Не удалось загрузить список"
            description="Сервер не ответил за 10 секунд."
            onRetry={retry}
            retrying={retrying}
          />
        </StateBox>
        <StateBox label="Нет доступа">
          <ForbiddenState
            requiredPermissions={demoPermissionsByModule.users.slice(1, 2)}
            className="min-h-32 p-6"
          />
        </StateBox>
      </div>
    </section>
  );
}

function StateBox({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-surface">
      <p className="border-b px-4 py-2 text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/* ---------------------------------- Контролы ----------------------------------- */

function ControlsRow() {
  const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    await wait(600);
    setSaving(false);
    toast.success('Настройки сервера сохранены', {
      description: 'Изменения применятся после перезапуска Survival #1.',
    });
  };

  return (
    <section
      aria-labelledby="ember-controls-title"
      className="overflow-hidden rounded-lg border bg-surface"
    >
      <h5 id="ember-controls-title" className="border-b px-4 py-3 font-display text-lg md:px-6">
        Контролы
      </h5>
      <div className="grid gap-8 p-4 md:grid-cols-2 md:p-6">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">Варианты</p>
            <div className="flex flex-wrap gap-2">
              <Button>Сохранить изменения</Button>
              <Button variant="secondary">Отменить</Button>
              <Button variant="outline">
                <Download aria-hidden />
                Экспорт
              </Button>
              <Button variant="ghost">Подробнее</Button>
              <Button variant="destructive">Удалить роль</Button>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">Размеры и состояния</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">Маленькая</Button>
              <Button size="md">Обычная</Button>
              <Button size="lg">Большая</Button>
              <Button loading>Сохраняем</Button>
              <Button disabled>Недоступно</Button>
              <Tooltip content="Обновить список">
                <IconButton aria-label="Обновить список" variant="outline">
                  <RefreshCw />
                </IconButton>
              </Tooltip>
            </div>
          </div>
        </div>

        <form onSubmit={save} className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">Поля</p>
          <Field label="Название сервера">
            <Input defaultValue="Survival #1" />
          </Field>
          <Field label="Поиск игрока">
            <Input leading={<Search />} placeholder="Ник или тег" />
          </Field>
          <Field label="Лимит привата, блоков" error="В 7 сезоне максимум 400 блоков">
            <Input defaultValue="500" inputMode="numeric" />
          </Field>
          <Field label="Slug" hint="Нельзя изменить после создания">
            <Input value="survival-1" disabled readOnly />
          </Field>
          <Select defaultValue="1.21.4">
            <Field label="Версия">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
            </Field>
            <SelectContent>
              <SelectItem value="1.21.4">1.21.4</SelectItem>
              <SelectItem value="1.21.1">1.21.1</SelectItem>
              <SelectItem value="1.20.6">1.20.6</SelectItem>
            </SelectContent>
          </Select>
          <Field label="Слотов">
            <NumberStepper defaultValue={500} min={10} max={1000} step={10} />
          </Field>
          <div className="divide-y divide-border-subtle border-y border-border-subtle">
            <SwitchField label="Белый список" description="Вход только игрокам из списка" />
            <CheckboxField label="Показывать в списке серверов" defaultChecked />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost">
              Отменить
            </Button>
            <Button type="submit" loading={saving}>
              Сохранить изменения
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
