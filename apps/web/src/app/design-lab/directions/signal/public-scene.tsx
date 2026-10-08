'use client';

import {
  Bell,
  Info,
  LogOut,
  Menu,
  MessageSquare,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  User,
  UserPlus,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  useCommandPalette,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { RolePrefix } from '@/components/ui/role-prefix';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import {
  demoEvents,
  demoNews,
  demoNotifications,
  demoProducts,
  demoServers,
  demoUsers,
  type DemoNotification,
} from '../../demo-data';
import type { ShowcaseProps } from '../registry';
import { coarseTarget, InstrumentLine, LiveDot, PanelHeading, roleOf } from './shared';

const NAV = [
  { href: '/news', label: 'Новости' },
  { href: '/servers', label: 'Сервера', current: true },
  { href: '/store', label: 'Магазин' },
  { href: '/events', label: 'События' },
  { href: '/top', label: 'Топ' },
] as const;

const me = demoUsers.find((user) => user.username === 'younaxo_') ?? demoUsers[0];
const profileUser = demoUsers.find((user) => user.username === 'EnderQueen') ?? demoUsers[1];
const onlineUsers = demoUsers.filter((user) => user.online);
const serversOnline = demoServers.filter((server) => server.online).length;
const playersOnline = demoServers.reduce((sum, server) => sum + server.players, 0);
const unreadCount = demoNotifications.filter((item) => !item.read).length;

/// Демо-переход: страницы лаборатории никуда не ведут, сообщаем об этом честно.
function demoNavigate(label: string) {
  toast.message(label, { description: 'Демо: переход не выполняется.' });
}

/* ---------- Navbar ---------- */

function Navbar() {
  const palette = useCommandPalette();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeAnd = (label: string) => {
    palette.setOpen(false);
    demoNavigate(label);
  };

  return (
    <header className="flex h-12 items-center gap-1 border-b bg-surface px-2 sm:px-3">
      <IconButton
        aria-label="Открыть меню"
        size="sm"
        className="md:hidden"
        onClick={() => setMenuOpen(true)}
      >
        <Menu />
      </IconButton>
      <a href="/" className="px-1 text-sm font-semibold tracking-tight">
        TwoMC
      </a>
      <nav aria-label="Разделы сайта" className="ml-2 hidden h-full items-stretch md:flex">
        {NAV.map((item) => (
          <a
            key={item.href}
            href={item.href}
            aria-current={'current' in item && item.current ? 'page' : undefined}
            className={cn(
              'inline-flex items-center border-b-2 border-transparent px-3 text-sm text-muted-foreground',
              'transition-colors duration-fast hover:text-foreground',
              'aria-[current=page]:border-primary aria-[current=page]:text-foreground',
            )}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 justify-center px-2">
        <button
          type="button"
          onClick={palette.toggle}
          className={cn(
            'hidden h-control-sm w-full max-w-md items-center gap-2 rounded-sm border bg-surface-sunken px-2.5 text-sm text-muted-foreground sm:flex',
            'transition-colors duration-fast hover:border-border-strong hover:text-foreground',
          )}
        >
          <Search aria-hidden className="size-4 shrink-0 text-subtle-foreground" />
          <span className="flex-1 truncate text-left">Поиск и команды</span>
          <span className="flex gap-0.5" aria-hidden>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
        <IconButton
          aria-label="Поиск и команды"
          size="sm"
          className="sm:hidden"
          onClick={palette.toggle}
        >
          <Search />
        </IconButton>
      </div>

      <NotificationBell />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Аккаунт: ${me.username}`}
            className={cn(
              'inline-flex size-[var(--control-h-sm)] items-center justify-center rounded-sm hover:bg-muted',
              '[@media(pointer:coarse)]:size-10',
            )}
          >
            <Avatar name={me.username} src={me.avatar} size="xs" shape="square" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="font-mono tabular">{me.tag}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => demoNavigate('Профиль')}>
            <User />
            Профиль
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => demoNavigate('Настройки')}>
            <Settings />
            Настройки
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => demoNavigate('Выход')}>
            <LogOut />
            Выйти
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" size="sm">
          <SheetHeader>
            <SheetTitle>Разделы</SheetTitle>
          </SheetHeader>
          <SheetBody className="px-0">
            <nav aria-label="Разделы сайта">
              <ul className="flex flex-col">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      aria-current={'current' in item && item.current ? 'page' : undefined}
                      className={cn(
                        'flex h-10 items-center border-l-2 border-transparent px-card-p text-sm',
                        'aria-[current=page]:border-primary aria-[current=page]:bg-muted aria-[current=page]:font-medium',
                      )}
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </SheetBody>
        </SheetContent>
      </Sheet>

      <CommandDialog open={palette.open} onOpenChange={palette.setOpen}>
        <CommandInput placeholder="Страница, игрок, сервер или действие…" />
        <CommandList>
          <CommandEmpty />
          <CommandGroup heading="Страницы">
            {NAV.map((item) => (
              <CommandItem key={item.href} onSelect={() => closeAnd(item.label)}>
                {item.label}
              </CommandItem>
            ))}
            <CommandItem onSelect={() => closeAnd('Админ-панель')}>
              <Shield />
              Админ-панель
              <CommandShortcut keys={['G', 'A']} />
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Пользователи">
            {demoUsers.map((user) => (
              <CommandItem
                key={user.id}
                value={`${user.username} ${user.tag}`}
                onSelect={() => closeAnd(user.username)}
              >
                <Avatar name={user.username} src={user.avatar} size="xs" shape="square" />
                <span className="truncate">{user.username}</span>
                <span className="ml-auto font-mono text-xs tabular text-subtle-foreground">
                  {user.tag}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Сервера">
            {demoServers.map((server) => (
              <CommandItem key={server.id} onSelect={() => closeAnd(server.name)}>
                <span className="truncate">{server.name}</span>
                <span className="ml-auto font-mono text-xs tabular text-subtle-foreground">
                  {server.players} / {server.maxPlayers}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Действия">
            <CommandItem onSelect={() => closeAnd('Создать обращение')}>
              <MessageSquare />
              Создать обращение
            </CommandItem>
            <CommandItem onSelect={() => closeAnd('Выход')}>
              <LogOut />
              Выйти
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </header>
  );
}

/* ---------- Уведомления ---------- */

const NOTIFICATION_ICON: Record<DemoNotification['kind'], typeof Bell> = {
  friend: UserPlus,
  order: ShoppingBag,
  moderation: Shield,
  system: Info,
};

function NotificationItem({ item }: { item: DemoNotification }) {
  const Icon = NOTIFICATION_ICON[item.kind];
  return (
    <li className="flex gap-3 px-3 py-2.5">
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm leading-5', !item.read && 'font-medium')}>
            {item.title}
            {!item.read ? <span className="sr-only"> — непрочитано</span> : null}
          </p>
          {!item.read ? <span aria-hidden className="mt-2 size-1.5 shrink-0 bg-primary" /> : null}
        </div>
        <p className="text-sm text-muted-foreground">{item.message}</p>
        <p className="mt-1 font-mono text-xs tabular text-subtle-foreground">
          {formatDateTime(item.at)}
        </p>
      </div>
    </li>
  );
}

function NotificationList({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-col divide-y divide-border-subtle', className)}>
      {demoNotifications.map((item) => (
        <NotificationItem key={item.id} item={item} />
      ))}
    </ul>
  );
}

function NotificationBell() {
  return (
    <Popover>
      <Tooltip content="Уведомления">
        <PopoverTrigger asChild>
          <IconButton
            aria-label={`Уведомления: ${unreadCount} непрочитанных`}
            size="sm"
            className="relative"
          >
            <Bell />
            {unreadCount > 0 ? (
              <span
                aria-hidden
                className="absolute right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-foreground px-1 font-mono text-[10px] font-medium tabular text-background"
              >
                {unreadCount}
              </span>
            ) : null}
          </IconButton>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end" className="w-80 rounded-sm p-0">
        <PanelHeading
          title="Уведомления"
          aside={
            <span className="font-mono text-xs tabular text-muted-foreground">
              {unreadCount} новых
            </span>
          }
        />
        <NotificationList />
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => toast.success('Все уведомления прочитаны')}
          >
            Отметить все прочитанными
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ---------- Hero: статусная таблица ---------- */

function Hero({ theme }: ShowcaseProps) {
  return (
    <section aria-labelledby="signal-hero-title" className="border-b bg-surface">
      <h4 id="signal-hero-title" className="sr-only">
        Статус серверов
      </h4>
      <div className="flex h-10 items-center gap-3 border-b px-3">
        <LiveDot />
        <InstrumentLine
          items={[
            <span key="brand" className="text-foreground">
              TwoMC
            </span>,
            `${demoServers.length} сервера`,
            `${formatNumber(playersOnline)} онлайн`,
            'обновлено 12 с назад',
          ]}
        />
        <span className="ml-auto hidden font-mono text-xs tabular text-subtle-foreground sm:inline">
          тема: {theme === 'dark' ? 'тёмная' : 'светлая'}
        </span>
      </div>
      <Table containerClassName="rounded-none border-0 bg-transparent">
        <TableHeader>
          <TableRow className="h-9">
            <TableHead className="pl-3">Сервер</TableHead>
            <TableHead>Версия</TableHead>
            <TableHead numeric>Игроки</TableHead>
            <TableHead numeric>Пинг</TableHead>
            <TableHead className="min-w-56">MOTD</TableHead>
            <TableHead className="pr-3">Статус</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {demoServers.map((server) => {
            const fill = Math.round((server.players / server.maxPlayers) * 100);
            return (
              <TableRow key={server.id}>
                <TableCell className="pl-3 font-medium">
                  <a
                    href={`/servers/${server.slug}`}
                    className="hover:underline underline-offset-4"
                  >
                    {server.name}
                  </a>
                </TableCell>
                <TableCell className="font-mono text-xs tabular text-muted-foreground">
                  {server.version}
                </TableCell>
                <TableCell numeric>
                  <div className="flex items-center justify-end gap-2">
                    <span className="font-mono text-xs">
                      {formatNumber(server.players)} / {formatNumber(server.maxPlayers)}
                    </span>
                    <Progress
                      value={fill}
                      size="sm"
                      tone={server.online ? 'success' : 'primary'}
                      label={`Заполненность ${server.name}`}
                      className="hidden w-16 rounded-sm sm:block"
                    />
                  </div>
                </TableCell>
                <TableCell numeric className="font-mono text-xs text-muted-foreground">
                  {server.pingMs === null ? '—' : `${server.pingMs} мс`}
                </TableCell>
                <TableCell className="text-muted-foreground" truncate>
                  {server.motd}
                </TableCell>
                <TableCell className="pr-3">
                  <StatusBadge status={server.online ? 'online' : 'offline'} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}

/* ---------- Сервера: карточки статуса ---------- */

function ServerStatusStrip() {
  return (
    <section aria-labelledby="signal-servers-title" className="border-b">
      <PanelHeading
        title={<span id="signal-servers-title">Сервера</span>}
        aside={
          <span className="font-mono text-xs tabular text-muted-foreground">
            {serversOnline} из {demoServers.length} в сети
          </span>
        }
        className="bg-surface"
      />
      <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
        {demoServers.map((server) => {
          const fill = Math.round((server.players / server.maxPlayers) * 100);
          return (
            <article key={server.id} className="flex flex-col gap-3 bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <h5 className="truncate text-sm font-medium">{server.name}</h5>
                {server.online ? (
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs text-success">
                    <LiveDot label={`${server.name} в сети`} />
                    live
                  </span>
                ) : (
                  <StatusBadge status="offline" />
                )}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs tabular">
                <dt className="text-subtle-foreground">игроки</dt>
                <dd className="text-right">
                  {formatNumber(server.players)} / {formatNumber(server.maxPlayers)}
                </dd>
                <dt className="text-subtle-foreground">версия</dt>
                <dd className="text-right">{server.version}</dd>
                <dt className="text-subtle-foreground">пинг</dt>
                <dd className="text-right">
                  {server.pingMs === null ? '—' : `${server.pingMs} мс`}
                </dd>
              </dl>
              <Progress
                value={fill}
                size="sm"
                tone={server.online ? 'success' : 'primary'}
                label={`Заполненность ${server.name}`}
                className="rounded-sm"
              />
              <p className="truncate text-xs text-muted-foreground">{server.motd}</p>
              <Button asChild variant="secondary" size="sm" className={cn('mt-auto', coarseTarget)}>
                <a href={`/servers/${server.slug}`}>Открыть страницу</a>
              </Button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- Новости / события / магазин ---------- */

function ContentGrid() {
  return (
    <section aria-label="Новости, события и магазин" className="border-b">
      <div className="grid gap-px bg-border lg:grid-cols-3">
        <div className="flex flex-col bg-surface">
          <PanelHeading
            title="Новости"
            aside={
              <a href="/news" className="text-xs text-muted-foreground hover:text-foreground">
                Все новости
              </a>
            }
          />
          <ul className="flex flex-col divide-y divide-border-subtle">
            {demoNews.map((news) => (
              <li key={news.id}>
                <article className="flex flex-col gap-1 p-3">
                  <h5 className="text-sm font-medium leading-5">
                    <a href={`/news/${news.id}`} className="hover:underline underline-offset-4">
                      {news.title}
                    </a>
                  </h5>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{news.excerpt}</p>
                  <InstrumentLine
                    className="mt-1"
                    items={[
                      formatDate(news.publishedAt),
                      news.author,
                      <span key="comments" className="inline-flex items-center gap-1">
                        <MessageSquare aria-hidden className="size-3" />
                        {news.comments}
                        <span className="sr-only"> комментариев</span>
                      </span>,
                    ]}
                  />
                </article>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col bg-surface">
          <PanelHeading
            title="События"
            aside={
              <a href="/events" className="text-xs text-muted-foreground hover:text-foreground">
                Календарь
              </a>
            }
          />
          <ul className="flex flex-col divide-y divide-border-subtle">
            {demoEvents.map((event) => (
              <li key={event.id}>
                <article className="flex flex-col gap-2 p-3">
                  <p className="font-mono text-xs tabular text-muted-foreground">
                    {formatDateTime(event.startsAt)}
                  </p>
                  <h5 className="text-sm font-medium leading-5">
                    <a href={`/events/${event.id}`} className="hover:underline underline-offset-4">
                      {event.title}
                    </a>
                  </h5>
                  <InstrumentLine
                    items={[
                      event.server,
                      <span key="participants" className="inline-flex items-center gap-1">
                        <Users aria-hidden className="size-3" />
                        {event.participants}
                        <span className="sr-only"> участников</span>
                      </span>,
                    ]}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className={cn('self-start', coarseTarget)}
                    onClick={() =>
                      toast.success('Заявка отправлена', {
                        description: `${event.title} · ${formatDateTime(event.startsAt)}`,
                      })
                    }
                  >
                    Участвовать
                  </Button>
                </article>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col bg-surface">
          <PanelHeading
            title="Магазин"
            aside={
              <a href="/store" className="text-xs text-muted-foreground hover:text-foreground">
                Все товары
              </a>
            }
          />
          <ul className="flex flex-col divide-y divide-border-subtle">
            {demoProducts.map((product) => (
              <li key={product.id}>
                <article className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <h5 className="truncate text-sm font-medium leading-5">{product.name}</h5>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{product.type}</Badge>
                      <span className="font-mono text-xs text-subtle-foreground">
                        {product.period}
                      </span>
                    </div>
                    <p className="mt-1.5 flex items-baseline gap-2 font-mono tabular">
                      <span className="text-sm font-medium">{formatMoney(product.price)}</span>
                      {product.oldPrice !== null ? (
                        <s className="text-xs text-subtle-foreground">
                          {formatMoney(product.oldPrice)}
                        </s>
                      ) : null}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className={coarseTarget}
                    onClick={() =>
                      toast.success('Товар добавлен в корзину', {
                        description: `${product.name} · ${formatMoney(product.price)}`,
                      })
                    }
                  >
                    Купить
                  </Button>
                </article>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------- Профиль + уведомления ---------- */

function ProfilePanel() {
  const role = roleOf(profileUser);
  return (
    <div className="flex flex-col bg-surface">
      <PanelHeading
        title="Профиль"
        aside={
          <span className="font-mono text-xs tabular text-muted-foreground">{profileUser.tag}</span>
        }
      />
      <div className="flex flex-col gap-4 p-3">
        <div className="flex flex-wrap items-start gap-3">
          <Avatar name={profileUser.username} src={profileUser.avatar} size="lg" shape="square" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <RolePrefix role={role} size="sm" />
              <h5 className="text-lg font-semibold leading-tight">{profileUser.username}</h5>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={profileUser.online ? 'online' : 'offline'} />
              <Badge color={profileUser.roleColor}>{profileUser.role}</Badge>
            </div>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              size="sm"
              className={cn('flex-1 sm:flex-none', coarseTarget)}
              onClick={() =>
                toast.success('Заявка в друзья отправлена', { description: profileUser.username })
              }
            >
              <UserPlus />
              Добавить в друзья
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className={cn('flex-1 sm:flex-none', coarseTarget)}
              onClick={() => demoNavigate(`Диалог с ${profileUser.username}`)}
            >
              <MessageSquare />
              Написать
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview" className="h-control-sm">
              Обзор
            </TabsTrigger>
            <TabsTrigger value="friends" count={onlineUsers.length} className="h-control-sm">
              Друзья
            </TabsTrigger>
            <TabsTrigger value="achievements" className="h-control-sm">
              Достижения
            </TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border bg-border sm:grid-cols-3">
              <div className="bg-surface p-3">
                <dt className="text-xs text-muted-foreground">Наиграно</dt>
                <dd className="mt-1 font-mono text-lg tabular">
                  {formatNumber(profileUser.playtimeHours)} ч
                </dd>
              </div>
              <div className="bg-surface p-3">
                <dt className="text-xs text-muted-foreground">На проекте с</dt>
                <dd className="mt-1 font-mono text-lg tabular">
                  {formatDate(profileUser.joinedAt)}
                </dd>
              </div>
              <div className="bg-surface p-3">
                <dt className="text-xs text-muted-foreground">Сервер сейчас</dt>
                <dd className="mt-1 font-mono text-lg tabular">{demoServers[0].name}</dd>
              </div>
            </dl>
          </TabsContent>
          <TabsContent value="friends">
            <div className="flex items-center gap-3 rounded-sm border p-3">
              <AvatarStack
                users={onlineUsers.map((user) => ({
                  id: user.id,
                  name: user.username,
                  src: user.avatar,
                }))}
                max={4}
              />
              <p className="text-sm text-muted-foreground">
                {onlineUsers.length} друзей в сети:{' '}
                {onlineUsers.map((user) => user.username).join(', ')}
              </p>
            </div>
          </TabsContent>
          <TabsContent value="achievements">
            <EmptyState
              size="sm"
              className="rounded-sm border"
              title="Достижения ещё не открыты"
              description="Зайдите на Survival #1: первое достижение выдаётся за 10 минут игры."
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function NotificationsPanel() {
  return (
    <div className="flex flex-col bg-surface">
      <PanelHeading
        title="Уведомления"
        aside={
          <span className="font-mono text-xs tabular text-muted-foreground">
            {unreadCount} новых
          </span>
        }
      />
      <NotificationList />
      <div className="mt-auto border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          className={cn('w-full', coarseTarget)}
          onClick={() => toast.success('Все уведомления прочитаны')}
        >
          Отметить все прочитанными
        </Button>
      </div>
    </div>
  );
}

/* ---------- Сцена ---------- */

export function PublicScene({ theme }: ShowcaseProps) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <Navbar />
      <Hero theme={theme} />
      <ServerStatusStrip />
      <ContentGrid />
      <section aria-label="Профиль и уведомления">
        <div className="grid gap-px bg-border lg:grid-cols-[3fr_2fr]">
          <ProfilePanel />
          <NotificationsPanel />
        </div>
      </section>
    </div>
  );
}
