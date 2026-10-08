'use client';

import {
  Ban,
  Check,
  Megaphone,
  Minus,
  Newspaper,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  Store,
  Users,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { Badge, StatusBadge, type BadgeProps, type Status } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Carousel, CarouselSlide } from '@/components/ui/carousel';
import { DataGrid, type DataGridColumn, type DataGridSort } from '@/components/ui/data-grid';
import { Kbd } from '@/components/ui/kbd';
import { Marquee } from '@/components/ui/marquee';
import { LimitSelect, Pagination, PaginationSummary } from '@/components/ui/pagination';
import { Progress, ProgressRing } from '@/components/ui/progress';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  ResizableSidebar,
} from '@/components/ui/resizable';
import { RolePrefix } from '@/components/ui/role-prefix';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Timeline, TimelineItem } from '@/components/ui/timeline';
import { toast } from '@/components/ui/toast';
import { TreeView, type TreeNode } from '@/components/ui/tree-view';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import {
  demoAudit,
  demoEvents,
  demoNews,
  demoServers,
  demoStats,
  demoUsers,
  type DemoAuditEntry,
  type DemoEvent,
  type DemoUser,
} from '../../demo-data';
import { DemoBlock, DemoGrid, DemoResult, DemoRow, useTimers } from './shared';

/// Группа «Данные»: таблицы, списки, навигация по данным, индикаторы.
export function DataDemos() {
  return (
    <DemoGrid>
      <DataGridDemo />
      <TableDemo />
      <PaginationDemo />
      <TreeViewDemo />
      <ResizableDemo />
      <AnimatedCounterDemo />
      <MarqueeDemo />
      <CarouselDemo />
      <BreadcrumbsDemo />
      <TimelineDemo />
      <BadgeDemo />
      <AvatarDemo />
      <RolePrefixDemo />
      <ProgressDemo />
      <KbdDemo />
    </DemoGrid>
  );
}

/* ------------------------------------- Table ------------------------------------- */

function TableDemo() {
  return (
    <DemoBlock
      title="Table"
      span={2}
      use="Семантическая таблица без состояния: короткие списки, сводки, детали. Числа — выравнивание вправо и табличные цифры."
      avoid="сортировки, выбора строк и пагинации — это DataGrid."
    >
      <Table>
        <TableCaption>Сервера проекта и текущий онлайн</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Сервер</TableHead>
            <TableHead>Версия</TableHead>
            <TableHead numeric>Онлайн</TableHead>
            <TableHead numeric>Пинг</TableHead>
            <TableHead>Статус</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {demoServers.map((server) => (
            <TableRow key={server.id}>
              <TableCell>
                <span className="font-medium">{server.name}</span>
                <span className="block text-xs text-muted-foreground">{server.motd}</span>
              </TableCell>
              <TableCell className="font-mono text-xs">{server.version}</TableCell>
              <TableCell numeric>
                {formatNumber(server.players)} / {formatNumber(server.maxPlayers)}
              </TableCell>
              <TableCell numeric>{server.pingMs === null ? '—' : `${server.pingMs} мс`}</TableCell>
              <TableCell>
                <StatusBadge status={server.online ? 'online' : 'offline'} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DemoBlock>
  );
}

/* ------------------------------------ DataGrid ----------------------------------- */

type GridMode = 'data' | 'loading' | 'empty' | 'error';

const GRID_MODES: { value: GridMode; label: string }[] = [
  { value: 'data', label: 'Данные' },
  { value: 'loading', label: 'Загрузка' },
  { value: 'empty', label: 'Пусто' },
  { value: 'error', label: 'Ошибка' },
];

const GRID_ERROR = new Error('Сервер вернул 500. Повторите через минуту.');

const SORTERS: Record<string, (a: DemoUser, b: DemoUser) => number> = {
  username: (a, b) => a.username.localeCompare(b.username, 'ru'),
  playtimeHours: (a, b) => a.playtimeHours - b.playtimeHours,
  joinedAt: (a, b) => a.joinedAt.localeCompare(b.joinedAt),
};

function userStatus(user: DemoUser): Status {
  if (user.banned) {
    return 'blocked';
  }
  return user.online ? 'online' : 'offline';
}

const GRID_COLUMNS: DataGridColumn<DemoUser>[] = [
  {
    key: 'username',
    header: 'Игрок',
    sortable: true,
    cell: (user) => (
      <span className="flex items-center gap-2">
        <Avatar name={user.username} src={user.avatar} size="xs" />
        <span className="font-medium">{user.username}</span>
      </span>
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
    cell: (user) => <StatusBadge status={userStatus(user)} />,
  },
  {
    key: 'playtimeHours',
    header: 'Наиграно',
    sortable: true,
    align: 'right',
    cell: (user) => `${formatNumber(user.playtimeHours)} ч`,
  },
  {
    key: 'joinedAt',
    header: 'Регистрация',
    sortable: true,
    hideOnMobile: true,
    cell: (user) => formatDate(user.joinedAt),
  },
];

function DataGridDemo() {
  const [mode, setMode] = useState<GridMode>('data');
  const [sort, setSort] = useState<DataGridSort | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  const { after } = useTimers();

  const sorted = useMemo(() => {
    const copy = [...demoUsers];
    if (sort) {
      const sorter = SORTERS[sort.key];
      if (sorter) {
        copy.sort((a, b) => (sort.direction === 'asc' ? sorter(a, b) : sorter(b, a)));
      }
    }
    return copy;
  }, [sort]);

  const rows = mode === 'data' ? sorted.slice((page - 1) * limit, page * limit) : [];
  const total = mode === 'data' ? demoUsers.length : 0;

  const retry = () => {
    setMode('loading');
    after(1200, () => setMode('data'));
  };

  const banSelected = () => {
    toast.success(`Забанено игроков: ${formatNumber(selected.size)}`);
    setSelected(new Set());
  };

  return (
    <DemoBlock
      title="DataGrid"
      span={3}
      use="Список с сортировкой, выбором строк и массовыми действиями, пагинацией и состояниями загрузки/пусто/ошибки. На mobile — карточки."
      avoid="коротких статичных списков (Table) и всего, что требует виртуализации или group-by."
    >
      <DemoRow>
        <SegmentedControl
          aria-label="Состояние таблицы"
          size="sm"
          options={GRID_MODES}
          value={mode}
          onValueChange={(value) => {
            const next = GRID_MODES.find((item) => item.value === value)?.value ?? 'data';
            setMode(next);
            setSelected(new Set());
          }}
        />
      </DemoRow>
      <div className="min-h-[28rem]">
        <DataGrid
          columns={GRID_COLUMNS}
          rows={rows}
          getRowId={(user) => user.id}
          sort={sort}
          onSortChange={(next) => {
            setSort(next);
            setPage(1);
          }}
          selection={{ selected, onChange: setSelected }}
          bulkActions={
            <Button size="sm" variant="destructive-outline" onClick={banSelected}>
              <Ban />
              Забанить
            </Button>
          }
          pagination={{
            page,
            limit,
            total,
            onPageChange: setPage,
            onLimitChange: (next) => {
              setLimit(next);
              setPage(1);
            },
          }}
          loading={mode === 'loading'}
          error={mode === 'error' ? GRID_ERROR : undefined}
          onRetry={retry}
          caption="Пользователи"
          emptyTitle="Игроки не найдены"
          emptyDescription="Измените фильтры или сбросьте поиск."
        />
      </div>
    </DemoBlock>
  );
}

/* ----------------------------------- Pagination ---------------------------------- */

function PaginationDemo() {
  const [page, setPage] = useState(3);
  const [limit, setLimit] = useState(20);
  const total = 1234;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const current = Math.min(page, totalPages);
  return (
    <DemoBlock
      title="Pagination / PaginationSummary / LimitSelect"
      use="Постраничная навигация длинных списков; состояние страницы живёт в URL или запросе."
      avoid="бесконечных лент — там «Показать ещё»."
    >
      <div className="flex flex-wrap items-center gap-3">
        <PaginationSummary page={current} limit={limit} total={total} />
        <LimitSelect
          value={limit}
          onChange={(next) => {
            setLimit(next);
            setPage(1);
          }}
        />
      </div>
      <Pagination page={current} totalPages={totalPages} onPageChange={setPage} />
      <Pagination
        size="sm"
        page={current}
        totalPages={totalPages}
        onPageChange={setPage}
        label="Пагинация, компактная"
      />
    </DemoBlock>
  );
}

/* ------------------------------------ TreeView ----------------------------------- */

const ADMIN_TREE: TreeNode[] = [
  {
    id: 'users',
    label: 'Пользователи',
    icon: <Users />,
    children: [
      { id: 'users.list', label: 'Список' },
      { id: 'users.bans', label: 'Баны' },
      { id: 'users.reports', label: 'Жалобы' },
    ],
  },
  {
    id: 'roles',
    label: 'Роли и права',
    icon: <Shield />,
    children: [
      { id: 'roles.list', label: 'Роли' },
      { id: 'roles.permissions', label: 'Права' },
    ],
  },
  {
    id: 'content',
    label: 'Контент',
    icon: <Newspaper />,
    children: [
      { id: 'content.news', label: 'Новости' },
      { id: 'content.events', label: 'События' },
    ],
  },
  {
    id: 'store',
    label: 'Магазин',
    icon: <Store />,
    children: [
      { id: 'store.products', label: 'Товары' },
      { id: 'store.orders', label: 'Заказы', disabled: true },
    ],
  },
  { id: 'settings', label: 'Настройки', icon: <Settings /> },
];

function TreeViewDemo() {
  const [selected, setSelected] = useState<string | null>('users.list');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['users']));
  return (
    <DemoBlock
      title="TreeView"
      use="Иерархия: разделы админки, структура прав, файлы ресурс-пака. Один tab-stop, внутри — стрелки, Home/End, Enter."
      avoid="плоских списков и навигации с 1–2 уровнями — там обычный список."
    >
      <TreeView
        nodes={ADMIN_TREE}
        label="Разделы админки"
        expanded={expanded}
        onExpandedChange={setExpanded}
        selected={selected}
        onSelect={setSelected}
      />
      <DemoResult>Выбрано: {selected ?? '—'}</DemoResult>
    </DemoBlock>
  );
}

/* ----------------------------------- Resizable ----------------------------------- */

function ResizableDemo() {
  const [active, setActive] = useState(demoServers[0].id);
  const server = demoServers.find((item) => item.id === active) ?? demoServers[0];
  return (
    <DemoBlock
      title="Resizable / ResizableSidebar"
      span={2}
      use="Две панели с перетаскиваемой границей (список/детали) и сайдбар с запоминаемой шириной. Ручка — role=separator со стрелками."
      avoid="mobile — там панели складываются в колонку."
    >
      <div className="h-48 overflow-hidden rounded border bg-surface">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={40} minSize={25} className="p-3">
            <p className="text-xs font-medium text-muted-foreground">Список</p>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {demoServers.map((item) => (
                <li key={item.id} className="truncate">
                  {item.name}
                </li>
              ))}
            </ul>
          </ResizablePanel>
          <ResizableHandle label="Изменить ширину списка" />
          <ResizablePanel className="p-3">
            <p className="text-xs font-medium text-muted-foreground">Детали</p>
            <p className="mt-2 text-sm">
              Перетащите границу мышью или сфокусируйте её и нажмите стрелки (Shift — крупнее).
            </p>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <div className="h-64 overflow-hidden rounded border bg-surface">
        <ResizableSidebar
          className="h-full"
          defaultWidth={200}
          minWidth={140}
          maxWidth={320}
          sidebarClassName="h-full bg-surface-sunken"
          sidebar={
            <nav aria-label="Сервера" className="flex h-full flex-col gap-0.5 p-2">
              {demoServers.map((item) => (
                <Button
                  key={item.id}
                  variant="ghost"
                  size="sm"
                  aria-current={item.id === active ? 'true' : undefined}
                  onClick={() => setActive(item.id)}
                  className={
                    item.id === active
                      ? 'justify-start bg-surface shadow-sm'
                      : 'justify-start text-muted-foreground'
                  }
                >
                  <span className="truncate">{item.name}</span>
                </Button>
              ))}
            </nav>
          }
        >
          <div className="flex h-full flex-col gap-2 p-4 text-sm">
            <p className="font-medium">{server.name}</p>
            <p className="text-muted-foreground">{server.motd}</p>
            <p className="tabular">
              {formatNumber(server.players)} / {formatNumber(server.maxPlayers)} онлайн · версия{' '}
              <span className="font-mono text-xs">{server.version}</span>
            </p>
          </div>
        </ResizableSidebar>
      </div>
    </DemoBlock>
  );
}

/* -------------------------------- AnimatedCounter -------------------------------- */

function AnimatedCounterDemo() {
  const [users, setUsers] = useState(demoStats.usersTotal);
  const [revenue, setRevenue] = useState(184_250);

  const recount = () => {
    setUsers(Math.round(1000 + Math.random() * 24_000));
    setRevenue(Math.round(50_000 + Math.random() * 400_000));
  };

  return (
    <DemoBlock
      title="AnimatedCounter"
      use="Статистика с «набеганием» числа: онлайн, игроков всего, баланс. При reduced-motion — сразу финальное значение."
      avoid="таблиц и списков — анимация там отвлекает."
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="font-display text-3xl font-semibold leading-none">
            <AnimatedCounter value={users} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Игроков всего</p>
        </div>
        <div>
          <p className="font-display text-3xl font-semibold leading-none">
            <AnimatedCounter value={revenue} format={(value) => formatMoney(Math.round(value))} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Выручка за месяц</p>
        </div>
      </div>
      <DemoRow>
        <Button variant="secondary" size="sm" onClick={recount}>
          <RefreshCw />
          Пересчитать
        </Button>
      </DemoRow>
    </DemoBlock>
  );
}

/* ------------------------------------ Marquee ------------------------------------ */

function MarqueeDemo() {
  return (
    <DemoBlock
      title="Marquee"
      use="Бегущая строка новостей или партнёров. Пауза по hover, фокусу и кнопке; при reduced-motion — статичная прокрутка."
      avoid="важного контента — его нельзя читать «на бегу»; продублируйте списком."
    >
      <Marquee speed={50} className="rounded border bg-surface-sunken px-3">
        {demoNews.map((item) => (
          <span key={item.id} className="whitespace-nowrap text-sm">
            <span className="font-medium">{item.title}</span>
            <span className="text-muted-foreground"> · {formatDate(item.publishedAt)}</span>
          </span>
        ))}
      </Marquee>
    </DemoBlock>
  );
}

/* ------------------------------------ Carousel ----------------------------------- */

const EXTRA_EVENT: DemoEvent = {
  id: 'e3',
  title: 'Открытие сезона SkyBlock',
  startsAt: '2026-10-25T15:00:00Z',
  participants: 58,
  server: 'SkyBlock',
};

const EVENTS: DemoEvent[] = [...demoEvents, EXTRA_EVENT];

function CarouselDemo() {
  const [index, setIndex] = useState(0);
  return (
    <DemoBlock
      title="Carousel"
      use="Несколько равнозначных карточек на ограниченной ширине: события, баннеры. Нативный свайп (scroll-snap), стрелки и точки."
      avoid="контента, который должен быть виден весь — используйте сетку."
    >
      <Carousel label="Ближайшие события" onIndexChange={setIndex}>
        {EVENTS.map((event) => (
          <CarouselSlide key={event.id} className="pr-2">
            <Card variant="sunken" className="flex h-full flex-col gap-2">
              <p className="text-sm font-medium">{event.title}</p>
              <p className="text-xs text-muted-foreground">
                {event.server} · {formatDateTime(event.startsAt)}
              </p>
              <p className="text-xs text-muted-foreground tabular">
                Участников: {formatNumber(event.participants)}
              </p>
              <Button size="sm" variant="secondary" className="mt-auto self-start">
                Участвовать
              </Button>
            </Card>
          </CarouselSlide>
        ))}
      </Carousel>
      <DemoResult>
        Слайд {index + 1} из {EVENTS.length}
      </DemoResult>
    </DemoBlock>
  );
}

/* ---------------------------------- Breadcrumbs ---------------------------------- */

function BreadcrumbsDemo() {
  return (
    <DemoBlock
      title="Breadcrumbs"
      use="Путь до текущей страницы в глубоких разделах (админка, профиль игрока). Последний элемент — текущий, без ссылки."
      avoid="страниц первого уровня — там крошки дублируют навигацию."
    >
      <Breadcrumbs
        items={[
          { label: 'Админка', href: '#lab' },
          { label: 'Пользователи', href: '#lab' },
          { label: demoUsers[1].username },
        ]}
      />
      <Breadcrumbs
        items={[
          { label: 'Магазин', href: '#lab' },
          { label: 'Привилегии', href: '#lab' },
          { label: 'VIP', href: '#lab' },
          { label: 'VIP на 30 дней' },
        ]}
      />
    </DemoBlock>
  );
}

/* ------------------------------------ Timeline ----------------------------------- */

const SEVERITY_TONE: Record<DemoAuditEntry['severity'], 'info' | 'warning' | 'destructive'> = {
  info: 'info',
  warning: 'warning',
  critical: 'destructive',
};

const ACTION_ICON: Record<string, ReactNode> = {
  'user.ban': <Ban />,
  'user.unban': <Check />,
  'settings.site.update': <Settings />,
  'roles.permissions.update': <Shield />,
  'notification.broadcast': <Megaphone />,
};

function TimelineDemo() {
  return (
    <DemoBlock
      title="Timeline"
      use="Хронология: audit log, история наказаний, события заказа. Тон маркера — по важности, иконка — по типу."
      avoid="шагов процесса (Steps) и обычных списков без времени."
    >
      <Timeline>
        {demoAudit.map((entry) => (
          <TimelineItem
            key={entry.id}
            tone={SEVERITY_TONE[entry.severity]}
            icon={ACTION_ICON[entry.action]}
            title={
              <>
                {entry.actor}{' '}
                <span className="font-mono text-xs font-normal text-muted-foreground">
                  {entry.action}
                </span>
              </>
            }
            meta={formatDateTime(entry.at)}
          >
            Цель: {entry.target}
          </TimelineItem>
        ))}
      </Timeline>
    </DemoBlock>
  );
}

/* ------------------------------------- Badge ------------------------------------- */

const BADGE_TONES: NonNullable<BadgeProps['tone']>[] = [
  'neutral',
  'primary',
  'success',
  'warning',
  'destructive',
  'info',
  'outline',
];

const STATUSES: Status[] = ['online', 'active', 'offline', 'idle', 'pending', 'warning', 'blocked'];

function BadgeDemo() {
  return (
    <DemoBlock
      title="Badge / StatusBadge"
      use="Короткая метка: роль (цвет из API), счётчик, статус с иконкой — цвет никогда не единственный носитель смысла."
      avoid="длинного текста и кликабельных элементов — бейдж не кнопка."
    >
      <DemoRow>
        {BADGE_TONES.map((tone) => (
          <Badge key={tone} tone={tone}>
            {tone}
          </Badge>
        ))}
      </DemoRow>
      <DemoRow>
        {STATUSES.map((status) => (
          <StatusBadge key={status} status={status} />
        ))}
      </DemoRow>
      <DemoRow>
        {demoUsers
          .filter((user) => user.roleColor)
          .map((user) => (
            <Badge key={user.id} color={user.roleColor}>
              {user.role}
            </Badge>
          ))}
        <StatusBadge status="blocked">Забанен до {formatDate('2026-10-15')}</StatusBadge>
      </DemoRow>
    </DemoBlock>
  );
}

/* ------------------------------------- Avatar ------------------------------------ */

const AVATAR_SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;

function AvatarDemo() {
  const user = demoUsers[0];
  return (
    <DemoBlock
      title="Avatar / AvatarStack"
      use="Голова скина (квадрат по умолчанию направления) или круглый аватар; без картинки — инициалы. Стопка — «сейчас онлайн»."
      avoid="декоративных картинок — у аватара всегда есть имя для alt."
    >
      <DemoRow>
        {AVATAR_SIZES.map((size) => (
          <Avatar key={size} name={user.username} src={user.avatar} size={size} />
        ))}
      </DemoRow>
      <DemoRow>
        <Avatar name={user.username} src={user.avatar} size="md" shape="square" />
        <Avatar name={user.username} src={user.avatar} size="md" shape="round" />
        <Avatar name="Lava_Walker" size="md" />
        <Avatar name="Ender Queen" size="md" shape="round" />
      </DemoRow>
      <AvatarStack
        users={demoUsers
          .filter((item) => item.online)
          .map((item) => ({ id: item.id, name: item.username, src: item.avatar }))}
        max={4}
      />
    </DemoBlock>
  );
}

/* ----------------------------------- RolePrefix ---------------------------------- */

const PREFIX_SIZES = ['xs', 'sm', 'md', 'lg'] as const;

function RolePrefixDemo() {
  return (
    <DemoBlock
      title="RolePrefix"
      use="Графический префикс роли из resource pack (целочисленный масштаб). Без PNG или при ошибке — текстовый бейдж."
      avoid="проверки прав — это только визуализация, права решает backend."
    >
      <div className="flex flex-col gap-2">
        {PREFIX_SIZES.map((size) => (
          <div key={size} className="flex items-center gap-3">
            <span className="w-6 font-mono text-xs text-subtle-foreground">{size}</span>
            <RolePrefix slug="moderator" name="Moderator" size={size} />
          </div>
        ))}
      </div>
      <DemoRow>
        <RolePrefix
          role={{ slug: 'vip', priority: 50, displayName: 'VIP', color: demoUsers[2].roleColor }}
        />
        <RolePrefix slug="unknown-role" name="Неизвестная роль" />
        <RolePrefix slug="player" name="Игрок" fallback="none" />
        <span className="text-xs text-muted-foreground">(fallback none — ничего)</span>
      </DemoRow>
    </DemoBlock>
  );
}

/* ------------------------------------ Progress ----------------------------------- */

function ProgressDemo() {
  const [value, setValue] = useState(45);
  const step = (delta: number) =>
    setValue((current) => Math.max(0, Math.min(100, current + delta)));
  return (
    <DemoBlock
      title="Progress / ProgressRing"
      use="Прогресс с известным концом: загрузка, квота, достижение. null — неопределённый. Кольцо — для компактных мест."
      avoid="ожидания без оценки — там Spinner."
    >
      <Progress value={value} label="Заполнение квоты" />
      <DemoRow>
        <Button size="sm" variant="secondary" onClick={() => step(-10)} disabled={value === 0}>
          <Minus />
          10 %
        </Button>
        <Button size="sm" variant="secondary" onClick={() => step(10)} disabled={value === 100}>
          <Plus />
          10 %
        </Button>
        <span className="text-sm text-muted-foreground tabular">{value} %</span>
      </DemoRow>
      <Progress value={null} size="sm" label="Синхронизация" />
      <DemoRow>
        <Progress value={value} size="sm" tone="success" label="Успех" className="w-20" />
        <Progress value={value} size="sm" tone="warning" label="Предупреждение" className="w-20" />
        <Progress value={value} size="sm" tone="destructive" label="Ошибка" className="w-20" />
      </DemoRow>
      <DemoRow>
        <ProgressRing value={value} label="Квота" />
        <ProgressRing value={value} size={64} strokeWidth={6} tone="success" label="Достижение">
          {Math.round(value / 10)}/10
        </ProgressRing>
        <ProgressRing value={100 - value} size={32} strokeWidth={3} tone="warning" label="Остаток">
          <span className="sr-only">{100 - value} %</span>
        </ProgressRing>
      </DemoRow>
    </DemoBlock>
  );
}

/* --------------------------------------- Kbd ------------------------------------- */

function KbdDemo() {
  return (
    <DemoBlock
      title="Kbd"
      use="Клавиши и сочетания в подсказках, меню, справке. Моноширинный, табличные цифры, не переносится."
      avoid="кнопок — Kbd не кликабелен."
    >
      <DemoRow>
        <span className="flex gap-0.5">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
        <span className="flex gap-0.5">
          <Kbd>⌘</Kbd>
          <Kbd>S</Kbd>
        </span>
        <Kbd>Esc</Kbd>
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
        <Kbd>Enter</Kbd>
      </DemoRow>
      <div className="flex items-center gap-2 rounded-sm bg-foreground px-3 py-2 text-xs text-background">
        Инвертированный на тёмном фоне tooltip
        <span className="flex gap-0.5">
          <Kbd inverted>Shift</Kbd>
          <Kbd inverted>F10</Kbd>
        </span>
      </div>
    </DemoBlock>
  );
}
