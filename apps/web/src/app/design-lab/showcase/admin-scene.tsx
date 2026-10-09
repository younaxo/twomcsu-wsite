'use client';

import {
  Activity,
  Ban,
  CalendarDays,
  ChartBar,
  Download,
  Ellipsis,
  Inbox,
  LayoutDashboard,
  Menu,
  MessageCircle,
  MessageSquareWarning,
  Newspaper,
  Plus,
  Receipt,
  ScrollText,
  Search,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Trophy,
  UserRound,
  Users,
  UserX,
  type LucideIcon,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Breadcrumbs, type BreadcrumbItem } from '@/components/ui/breadcrumbs';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckboxField } from '@/components/ui/checkbox';
import { DataGrid, type DataGridColumn, type DataGridSort } from '@/components/ui/data-grid';
import { DatePicker, type IsoDate } from '@/components/ui/date-picker';
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
import { Field, Label } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { formatDate, formatNumber } from '@/lib/format';
import { useIsMobile } from '@/lib/use-media-query';
import { demoServers, demoStats, demoUsers, type DemoUser } from '../demo-data';
import { AccountMenu, isStaff, NotificationBell, plural, UserName, wait } from './shared';

/* ------------------------------------------------------------------ */
/* Сайдбар                                                             */
/* ------------------------------------------------------------------ */

interface SidebarItem {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  count?: number;
}

const SIDEBAR_GROUPS: { title: string; items: SidebarItem[] }[] = [
  {
    title: 'Дашборд',
    items: [
      { label: 'Обзор', icon: LayoutDashboard },
      { label: 'Статистика', icon: ChartBar },
    ],
  },
  {
    title: 'Пользователи',
    items: [
      { label: 'Все пользователи', icon: Users, active: true },
      { label: 'Роли', icon: Shield },
      { label: 'Баны', icon: Ban },
    ],
  },
  {
    title: 'Модерация',
    items: [
      { label: 'Обращения', icon: Inbox, count: demoStats.pendingReports },
      {
        label: 'Жалобы на комментарии',
        icon: MessageSquareWarning,
        count: demoStats.pendingCommentReports,
      },
      { label: 'Жалобы на профили', icon: UserX, count: demoStats.pendingProfileReports },
    ],
  },
  {
    title: 'Контент',
    items: [
      { label: 'Новости', icon: Newspaper },
      { label: 'События', icon: CalendarDays },
      { label: 'Достижения', icon: Trophy },
    ],
  },
  {
    title: 'Магазин',
    items: [
      { label: 'Товары', icon: ShoppingBag },
      { label: 'Заказы', icon: Receipt },
    ],
  },
  {
    title: 'Сервера',
    items: [
      { label: 'Список', icon: Server },
      { label: 'Мониторинг', icon: Activity },
    ],
  },
  {
    title: 'Система',
    items: [
      { label: 'Настройки', icon: Settings },
      { label: 'Журнал действий', icon: ScrollText },
    ],
  },
];

const adminUser = demoUsers.find((user) => user.username === 'younaxo_') ?? demoUsers[0];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Разделы админ-панели" className="flex flex-col gap-6">
      {SIDEBAR_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="mb-1.5 px-3 text-xs font-medium text-subtle-foreground">{group.title}</p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.label}>
                <a
                  href="#daylight-admin-title"
                  aria-current={item.active ? 'page' : undefined}
                  onClick={onNavigate}
                  className={cn(
                    'flex h-10 items-center gap-3 rounded px-3 text-sm font-medium transition-colors duration-fast [&_svg]:size-4 [&_svg]:shrink-0',
                    item.active
                      ? 'bg-primary-soft text-primary-soft-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <item.icon aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.count !== undefined ? (
                    <span className="text-xs font-semibold tabular text-foreground">
                      <span className="sr-only">В очереди: </span>
                      {formatNumber(item.count)}
                    </span>
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-surface lg:flex">
      <div className="flex h-16 items-center gap-3 border-b border-border-subtle px-5">
        <p className="font-display text-xl font-bold tracking-tight">twomc.su</p>
        <p className="text-xs text-muted-foreground">Админ-панель</p>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-5 scrollbar-thin">
        <SidebarNav />
      </div>
      <div className="flex items-center gap-3 border-t border-border-subtle p-4">
        <Avatar name={adminUser.username} src={adminUser.avatar} size="sm" shape="round" />
        <div className="min-w-0">
          <UserName user={adminUser} />
          <p className="truncate text-xs text-muted-foreground">{adminUser.role}</p>
        </div>
      </div>
    </aside>
  );
}

function SidebarSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" size="sm" aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle className="font-display text-xl font-bold tracking-tight">
            twomc.su
            <span className="ml-2 text-xs font-normal text-muted-foreground">Админ-панель</span>
          </SheetTitle>
        </SheetHeader>
        <SheetBody>
          <SidebarNav onNavigate={() => onOpenChange(false)} />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Верхняя панель                                                      */
/* ------------------------------------------------------------------ */

const BREADCRUMBS: BreadcrumbItem[] = [
  { label: 'Админ-панель', href: '#daylight-admin-title' },
  { label: 'Пользователи', href: '#daylight-admin-title' },
  { label: 'Все пользователи' },
];

function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const mobile = useIsMobile();
  return (
    <header className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 border-b bg-surface px-4 py-2 md:px-6">
      <Tooltip content="Разделы">
        <IconButton
          aria-label="Открыть разделы"
          variant="outline"
          className="lg:hidden"
          onClick={onOpenMenu}
        >
          <Menu />
        </IconButton>
      </Tooltip>
      <Breadcrumbs items={mobile ? BREADCRUMBS.slice(1) : BREADCRUMBS} className="min-w-0 flex-1" />
      <div className="hidden w-64 md:block">
        <Input
          leading={<Search />}
          placeholder="Игрок, заказ или обращение"
          aria-label="Поиск по админ-панели"
        />
      </div>
      <NotificationBell />
      <AccountMenu user={adminUser} />
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Stat-карточки                                                       */
/* ------------------------------------------------------------------ */

const PERCENT = new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 });

function StatCards() {
  const serversOnline = demoServers.filter((server) => server.online).length;
  const stats = [
    {
      label: 'Всего аккаунтов',
      value: demoStats.usersTotal,
      note: `+${formatNumber(demoStats.usersNewToday)} за сегодня`,
    },
    {
      label: 'Сейчас онлайн',
      value: demoStats.usersOnline,
      note: `на ${serversOnline} из ${demoServers.length} серверов`,
    },
    {
      label: 'Обращений в очереди',
      value: demoStats.pendingReports,
      note: `${demoStats.pendingCommentReports} на комментарии, ${demoStats.pendingProfileReports} на профиль`,
    },
    {
      label: 'Забанено',
      value: demoStats.usersBanned,
      note: `${PERCENT.format(demoStats.usersBanned / demoStats.usersTotal)} всех аккаунтов`,
    },
  ];
  return (
    <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <li key={stat.label}>
          <Card className="h-full">
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="mt-2 font-display text-3xl font-bold tracking-tight tabular">
              {formatNumber(stat.value)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{stat.note}</p>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Таблица пользователей                                               */
/* ------------------------------------------------------------------ */

type StatusFilter = 'all' | 'online' | 'banned';
type RoleFilter = 'all' | 'player' | 'vip' | 'staff';

function statusOf(user: DemoUser): 'online' | 'offline' | 'blocked' {
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
      return isStaff(user);
    default:
      return true;
  }
}

function matchesStatus(user: DemoUser, filter: StatusFilter): boolean {
  switch (filter) {
    case 'online':
      return user.online && !user.banned;
    case 'banned':
      return user.banned === true;
    default:
      return true;
  }
}

function compareUsers(a: DemoUser, b: DemoUser, sort: DataGridSort | null): number {
  if (!sort) {
    return 0;
  }
  const direction = sort.direction === 'asc' ? 1 : -1;
  switch (sort.key) {
    case 'user':
      return a.username.localeCompare(b.username, 'ru') * direction;
    case 'playtime':
      return (a.playtimeHours - b.playtimeHours) * direction;
    case 'joined':
      return (Date.parse(a.joinedAt) - Date.parse(b.joinedAt)) * direction;
    default:
      return 0;
  }
}

function RowActions({
  user,
  onBan,
  onGrantRole,
}: {
  user: DemoUser;
  onBan: (user: DemoUser) => void;
  onGrantRole: (user: DemoUser) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton aria-label={`Действия: ${user.username}`}>
          <Ellipsis />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => toast.message(`Профиль ${user.username}`)}>
          <UserRound />
          Открыть профиль
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onGrantRole(user)}>
          <Shield />
          Выдать роль
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toast.message(`Диалог с ${user.username}`)}>
          <MessageCircle />
          Написать
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {user.banned ? (
          <DropdownMenuItem onSelect={() => toast.success(`${user.username}: бан снят`)}>
            <ShieldCheck />
            Снять бан
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem variant="destructive" onSelect={() => onBan(user)}>
            <Ban />
            Забанить
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FiltersPopover() {
  const [after, setAfter] = useState<IsoDate | null>(null);
  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    toast.success('Фильтры применены');
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary">
          <SlidersHorizontal />
          Фильтры
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <form onSubmit={apply} className="flex flex-col gap-4">
          <p className="font-semibold">Фильтры</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="daylight-filter-server">Сервер</Label>
            <Select defaultValue="any">
              <SelectTrigger id="daylight-filter-server">
                <SelectValue placeholder="Любой" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Любой</SelectItem>
                {demoServers.map((server) => (
                  <SelectItem key={server.id} value={server.slug}>
                    {server.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field label="Зарегистрирован после">
            <DatePicker value={after} onChange={setAfter} />
          </Field>
          <CheckboxField
            label="Только с нарушениями"
            description="Есть предупреждения или активный мут"
          />
          <SwitchField label="Показывать забаненных" defaultChecked />
          <div className="flex justify-end gap-2 border-t border-border-subtle pt-4">
            <PopoverClose asChild>
              <Button type="button" variant="ghost" onClick={() => setAfter(null)}>
                Сбросить
              </Button>
            </PopoverClose>
            <PopoverClose asChild>
              <Button type="submit">Применить</Button>
            </PopoverClose>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function UsersTable({
  onBan,
  onGrantRole,
}: {
  onBan: (label: string, ids: string[]) => void;
  onGrantRole: (user: DemoUser | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<DataGridSort | null>({ key: 'playtime', direction: 'desc' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const needle = query.trim().toLowerCase();
  const rows = demoUsers
    .filter(
      (user) =>
        matchesRole(user, roleFilter) &&
        matchesStatus(user, status) &&
        (needle === '' || user.username.toLowerCase().includes(needle)),
    )
    .sort((a, b) => compareUsers(a, b, sort));
  const totalPages = Math.max(1, Math.ceil(rows.length / limit));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * limit, safePage * limit);

  const columns: DataGridColumn<DemoUser>[] = [
    {
      key: 'user',
      header: 'Пользователь',
      sortable: true,
      cell: (user) => (
        <div className="flex items-center gap-3">
          <Avatar name={user.username} src={user.avatar} size="sm" shape="round" />
          <div className="min-w-0">
            <UserName user={user} fallback="none" />
            <p className="truncate font-mono text-xs text-subtle-foreground">{user.tag}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Роль',
      cell: (user) => <Badge color={user.roleColor}>{user.role}</Badge>,
    },
    {
      key: 'status',
      header: 'Статус',
      cell: (user) => <StatusBadge status={statusOf(user)} />,
    },
    {
      key: 'playtime',
      header: 'Наиграно',
      sortable: true,
      align: 'right',
      cell: (user) => `${formatNumber(user.playtimeHours)} ч`,
    },
    {
      key: 'joined',
      header: 'Регистрация',
      sortable: true,
      cell: (user) => formatDate(user.joinedAt),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Действия</span>,
      align: 'right',
      cell: (user) => (
        <RowActions
          user={user}
          onBan={(target) => onBan(target.username, [target.id])}
          onGrantRole={onGrantRole}
        />
      ),
    },
  ];

  const selectedCount = selected.size;

  return (
    <DataGrid
      columns={columns}
      rows={pageRows}
      getRowId={(user) => user.id}
      sort={sort}
      onSortChange={setSort}
      selection={{ selected, onChange: setSelected }}
      bulkActions={
        <>
          <Button variant="secondary" onClick={() => onGrantRole(null)}>
            <Shield />
            Выдать роль
          </Button>
          <Button
            variant="destructive-outline"
            onClick={() =>
              onBan(
                `${formatNumber(selectedCount)} ${plural(selectedCount, {
                  one: 'пользователя',
                  few: 'пользователей',
                  many: 'пользователей',
                })}`,
                [...selected],
              )
            }
          >
            <Ban />
            Забанить выбранных
          </Button>
        </>
      }
      toolbar={
        <>
          <div className="w-full sm:w-72">
            <Input
              leading={<Search />}
              placeholder="Найти по нику"
              aria-label="Поиск по нику"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={roleFilter}
            onValueChange={(value) => {
              setRoleFilter(value as RoleFilter);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Роль" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все роли</SelectItem>
              <SelectItem value="player">Игроки</SelectItem>
              <SelectItem value="vip">VIP</SelectItem>
              <SelectItem value="staff">Команда проекта</SelectItem>
            </SelectContent>
          </Select>
          <SegmentedControl
            aria-label="Статус"
            value={status}
            onValueChange={(value) => {
              setStatus(value as StatusFilter);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'Все' },
              { value: 'online', label: 'Онлайн' },
              { value: 'banned', label: 'Забанены' },
            ]}
          />
          <FiltersPopover />
        </>
      }
      pagination={{
        page: safePage,
        limit,
        total: rows.length,
        onPageChange: setPage,
        onLimitChange: (next) => {
          setLimit(next);
          setPage(1);
        },
      }}
      emptyTitle="Никого не нашли"
      emptyDescription="Измените запрос или снимите фильтры."
      caption="Пользователи проекта: ник, роль, статус, наигранное время и дата регистрации"
      containerClassName="rounded-lg border-0 shadow"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Диалог «Выдать роль»                                                */
/* ------------------------------------------------------------------ */

function GrantRoleDialog({
  user,
  open,
  onOpenChange,
}: {
  user: DemoUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [until, setUntil] = useState<IsoDate | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    await wait(700);
    setSaving(false);
    onOpenChange(false);
    toast.success('Роль выдана', {
      description: user ? `${user.username} получит уведомление` : 'Игрок получит уведомление',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Выдать роль</DialogTitle>
          <DialogDescription>Роль действует на всех серверах и на сайте.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-5">
            <Field label="Игрок" required>
              <Input
                key={user?.id ?? 'new'}
                defaultValue={user?.username ?? ''}
                placeholder="Ник"
              />
            </Field>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="daylight-grant-role" required>
                Роль
              </Label>
              <Select defaultValue="helper">
                <SelectTrigger id="daylight-grant-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vip">VIP</SelectItem>
                  <SelectItem value="helper">Хелпер</SelectItem>
                  <SelectItem value="moderator">Модератор</SelectItem>
                  <SelectItem value="senior-moderator">Старший модератор</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Field label="Действует до" hint="Пусто — бессрочно">
              <DatePicker value={until} onChange={setUntil} />
            </Field>
            <Field label="Комментарий" hint="Попадёт в журнал действий">
              <Textarea rows={3} placeholder="За что выдана роль" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={saving}>
                Отмена
              </Button>
            </DialogClose>
            <Button type="submit" loading={saving}>
              Выдать роль
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Состояния                                                           */
/* ------------------------------------------------------------------ */

function StateCell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li>
      <Card flush className="h-full">
        <p className="border-b border-border-subtle px-4 py-2.5 text-xs font-medium text-muted-foreground">
          {title}
        </p>
        {children}
      </Card>
    </li>
  );
}

function StatesRow() {
  return (
    <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      <StateCell title="Загрузка">
        <div aria-busy className="py-2">
          <SkeletonRows rows={3} />
          <p className="sr-only">Загружаем список…</p>
        </div>
      </StateCell>
      <StateCell title="Пусто">
        <EmptyState
          size="sm"
          icon={<Inbox />}
          title="Обращений пока нет"
          description="Новые обращения игроков появятся здесь."
          action={
            <Button variant="secondary" onClick={() => toast.message('Архив обращений')}>
              Открыть архив
            </Button>
          }
        />
      </StateCell>
      <StateCell title="Ошибка">
        <ErrorState
          size="sm"
          title="Не удалось загрузить список"
          description="Сервер статистики не ответил за 10 секунд."
          onRetry={() => toast.message('Повторяем запрос…')}
        />
      </StateCell>
      <StateCell title="Нет доступа">
        <ForbiddenState requiredPermissions={['users.ban']} className="min-h-32 gap-2 p-6" />
      </StateCell>
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Контролы                                                            */
/* ------------------------------------------------------------------ */

function ControlGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold">{title}</p>
      {children}
    </div>
  );
}

function ControlsPanel() {
  return (
    <Card className="flex flex-col gap-8">
      <div className="grid gap-8 lg:grid-cols-2">
        <ControlGroup title="Кнопки">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => toast.success('Изменения сохранены')}>
              Сохранить изменения
            </Button>
            <Button variant="secondary">Отменить</Button>
            <Button variant="outline">Экспортировать</Button>
            <Button variant="ghost">Подробнее</Button>
            <Button variant="destructive">Удалить роль</Button>
            <Button variant="destructive-outline">Снять бан</Button>
            <Button variant="link">Открыть журнал</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">
              <Plus />
              Добавить
            </Button>
            <Button size="md">
              <Plus />
              Добавить
            </Button>
            <Button size="lg">
              <Plus />
              Добавить
            </Button>
            <Tooltip content="Скачать отчёт">
              <IconButton aria-label="Скачать отчёт" variant="secondary">
                <Download />
              </IconButton>
            </Tooltip>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button loading>Сохраняем</Button>
            <Button variant="secondary" loading>
              Загружаем
            </Button>
            <Button disabled>Опубликовать</Button>
            <Button variant="secondary" disabled>
              Отменить
            </Button>
          </div>
        </ControlGroup>

        <ControlGroup title="Поля">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ник">
              <Input placeholder="Steve_Mainer" />
            </Field>
            <Field label="Поиск">
              <Input leading={<Search />} placeholder="Найти игрока" />
            </Field>
            <Field label="E-mail" error="Введите адрес вида name@example.com">
              <Input type="email" defaultValue="steve@" />
            </Field>
            <Field label="ID аккаунта" hint="Назначается при регистрации">
              <Input defaultValue="u1" disabled />
            </Field>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="daylight-control-server">Сервер</Label>
              <Select defaultValue="survival-1">
                <SelectTrigger id="daylight-control-server">
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
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="daylight-control-server-disabled">Сервер (недоступно)</Label>
              <Select defaultValue="creative" disabled>
                <SelectTrigger id="daylight-control-server-disabled">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="creative">Creative</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </ControlGroup>
      </div>

      <ControlGroup title="Вкладки">
        <Tabs defaultValue="profile">
          <TabsList>
            <TabsTrigger value="profile">Профиль</TabsTrigger>
            <TabsTrigger value="security">Безопасность</TabsTrigger>
            <TabsTrigger value="notifications" count={2}>
              Уведомления
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="profile"
            className="flex max-w-xl flex-col divide-y divide-border-subtle"
          >
            <SwitchField
              label="Показывать онлайн-статус"
              description="Друзья видят, когда вы в игре"
              defaultChecked
            />
            <CheckboxField label="Получать новости на почту" description="Не чаще раза в неделю" />
          </TabsContent>
          <TabsContent value="security" className="max-w-xl text-sm text-muted-foreground">
            Двухфакторная защита выключена. Включите её в настройках аккаунта, чтобы защитить
            покупки.
          </TabsContent>
          <TabsContent value="notifications" className="max-w-xl text-sm text-muted-foreground">
            Два непрочитанных уведомления: заявка в друзья и оплаченный заказ.
          </TabsContent>
        </Tabs>
      </ControlGroup>

      <div className="flex flex-col-reverse gap-2 border-t border-border-subtle pt-5 sm:flex-row sm:justify-end">
        <Button variant="secondary">Отменить</Button>
        <Button
          onClick={() =>
            toast.success('Изменения сохранены', { description: 'Настройки применятся сразу' })
          }
        >
          Сохранить изменения
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Сцена                                                               */
/* ------------------------------------------------------------------ */

export function AdminScene() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [banTarget, setBanTarget] = useState<{ label: string; ids: string[] } | null>(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roleUser, setRoleUser] = useState<DemoUser | null>(null);

  const openRoleDialog = (user: DemoUser | null) => {
    setRoleUser(user);
    setRoleDialogOpen(true);
  };

  return (
    <div className="flex overflow-hidden rounded-lg border bg-background shadow-sm">
      <Sidebar />
      <SidebarSheet open={menuOpen} onOpenChange={setMenuOpen} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMenu={() => setMenuOpen(true)} />

        <main className="flex flex-col gap-10 p-4 md:p-6 xl:p-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
              <div>
                <h4
                  id="daylight-admin-title"
                  className="scroll-mt-24 font-display text-3xl font-bold tracking-tight"
                >
                  Пользователи
                </h4>
                <p className="mt-1 text-base text-muted-foreground">
                  {formatNumber(demoStats.usersTotal)}{' '}
                  {plural(demoStats.usersTotal, {
                    one: 'аккаунт',
                    few: 'аккаунта',
                    many: 'аккаунтов',
                  })}
                  , {formatNumber(demoStats.usersOnline)} сейчас в игре
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    toast.success('Экспорт запущен', {
                      description: 'Файл появится в журнале действий',
                    })
                  }
                >
                  <Download />
                  Экспорт
                </Button>
                <Button onClick={() => openRoleDialog(null)}>
                  <Plus />
                  Выдать роль
                </Button>
              </div>
            </div>
            <StatCards />
          </div>

          <section aria-labelledby="daylight-admin-table-title" className="flex flex-col gap-5">
            <h5
              id="daylight-admin-table-title"
              className="font-display text-xl font-bold tracking-tight"
            >
              Все пользователи
            </h5>
            <UsersTable
              onBan={(label, ids) => setBanTarget({ label, ids })}
              onGrantRole={openRoleDialog}
            />
          </section>

          <section aria-labelledby="daylight-admin-states-title" className="flex flex-col gap-5">
            <h5
              id="daylight-admin-states-title"
              className="font-display text-xl font-bold tracking-tight"
            >
              Состояния
            </h5>
            <StatesRow />
          </section>

          <section aria-labelledby="daylight-admin-controls-title" className="flex flex-col gap-5">
            <h5
              id="daylight-admin-controls-title"
              className="font-display text-xl font-bold tracking-tight"
            >
              Контролы
            </h5>
            <ControlsPanel />
          </section>
        </main>
      </div>

      <ConfirmDialog
        open={banTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setBanTarget(null);
          }
        }}
        title={`Забанить ${banTarget?.label ?? ''}?`}
        description="Доступ к серверам и сайту закроется сразу. Снять бан можно в разделе «Баны»."
        confirmLabel="Забанить"
        destructive
        onConfirm={async () => {
          await wait(700);
          toast.success(`Бан выдан: ${banTarget?.label ?? ''}`, {
            description: 'Запись добавлена в журнал действий',
          });
        }}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="daylight-ban-term">Срок</Label>
            <Select defaultValue="7d">
              <SelectTrigger id="daylight-ban-term">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1d">1 день</SelectItem>
                <SelectItem value="7d">7 дней</SelectItem>
                <SelectItem value="30d">30 дней</SelectItem>
                <SelectItem value="forever">Навсегда</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Field label="Причина" hint="Игрок увидит её при попытке зайти" required>
            <Textarea rows={3} placeholder="Например: читы на Survival #1" />
          </Field>
        </div>
      </ConfirmDialog>

      <GrantRoleDialog user={roleUser} open={roleDialogOpen} onOpenChange={setRoleDialogOpen} />
    </div>
  );
}
