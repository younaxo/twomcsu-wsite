'use client';

import {
  Bell,
  CalendarDays,
  Gavel,
  Info,
  Menu,
  MessageSquare,
  Newspaper,
  Search,
  Server,
  ShoppingBag,
  Trophy,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { Avatar } from '@/components/ui/avatar';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  useCommandPalette,
} from '@/components/ui/command';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { RolePrefix } from '@/components/ui/role-prefix';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { formatDate, formatMoney, formatNumber, formatRelative } from '@/lib/format';
import {
  demoEvents,
  demoNews,
  demoNotifications,
  demoProducts,
  demoServers,
  demoStats,
  demoUsers,
  type DemoNotification,
  type DemoProduct,
  type DemoServer,
  type DemoUser,
} from '../../demo-data';
import {
  DEMO_NOW,
  dateParts,
  formatHours,
  formatTime,
  pluralRu,
  roleSlug,
  useLiveValue,
} from './shared';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  active?: boolean;
}

const NAV: NavItem[] = [
  { label: 'Новости', href: '#ember-news', icon: Newspaper },
  { label: 'Сервера', href: '#ember-servers', icon: Server, active: true },
  { label: 'Магазин', href: '#ember-store', icon: ShoppingBag },
  { label: 'События', href: '#ember-events', icon: CalendarDays },
  { label: 'Топ', href: '#ember-profile', icon: Trophy },
];

const NOTIFICATION_ICON: Record<DemoNotification['kind'], LucideIcon> = {
  friend: UserPlus,
  order: ShoppingBag,
  moderation: Gavel,
  system: Info,
};

const userByName = (username: string): DemoUser | undefined =>
  demoUsers.find((user) => user.username === username);

/* ------------------------------------ Сцена ------------------------------------ */

export function PublicScene() {
  const [notifications, setNotifications] = useState(demoNotifications);
  const palette = useCommandPalette();

  const markRead = (id: string) =>
    setNotifications((items) =>
      items.map((item) => (item.id === id ? { ...item, read: true } : item)),
    );
  const markAllRead = () =>
    setNotifications((items) => items.map((item) => ({ ...item, read: true })));

  return (
    <div className="bg-background text-foreground">
      <PublicNavbar
        notifications={notifications}
        onRead={markRead}
        onReadAll={markAllRead}
        onOpenSearch={palette.toggle}
      />
      <Hero />
      <ServersSection />
      <FeedSection />
      <ProfileSection notifications={notifications} onRead={markRead} onReadAll={markAllRead} />
      <SearchPalette open={palette.open} onOpenChange={palette.setOpen} />
    </div>
  );
}

/* ------------------------------------ Navbar ----------------------------------- */

interface NotificationsApi {
  notifications: DemoNotification[];
  onRead: (id: string) => void;
  onReadAll: () => void;
}

function PublicNavbar({
  notifications,
  onRead,
  onReadAll,
  onOpenSearch,
}: NotificationsApi & { onOpenSearch: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const unread = notifications.filter((item) => !item.read).length;

  return (
    <header className="border-b bg-background">
      <div className="flex h-14 items-center gap-2 px-4 md:px-6">
        <IconButton
          aria-label="Открыть меню"
          className="-ml-2 md:hidden"
          onClick={() => setMenuOpen(true)}
        >
          <Menu />
        </IconButton>
        <Link href="#ember-public" className="rounded-sm font-display text-lg font-semibold">
          TwoMC
        </Link>
        <nav aria-label="Разделы сайта" className="ml-4 hidden self-stretch md:flex">
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={cn(
                '-mb-px inline-flex items-center border-b-2 px-3 text-sm transition-colors duration-fast',
                item.active
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Tooltip content="Поиск по сайту" shortcut={['⌘', 'K']}>
            <button
              type="button"
              onClick={onOpenSearch}
              className={cn(
                'hidden h-control-sm items-center gap-2 rounded border border-border bg-surface px-2.5 text-sm text-muted-foreground sm:inline-flex',
                'transition-colors duration-fast hover:border-border-strong hover:text-foreground',
              )}
            >
              <Search aria-hidden className="size-4" />
              <span>Поиск</span>
              <Kbd>⌘K</Kbd>
            </button>
          </Tooltip>
          <IconButton aria-label="Поиск по сайту" className="sm:hidden" onClick={onOpenSearch}>
            <Search />
          </IconButton>
          <Popover>
            <PopoverTrigger asChild>
              <IconButton
                aria-label={
                  unread > 0 ? `Уведомления, непрочитанных: ${formatNumber(unread)}` : 'Уведомления'
                }
                className="relative"
              >
                <Bell />
                {unread > 0 ? (
                  <span
                    aria-hidden
                    className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground tabular"
                  >
                    {unread}
                  </span>
                ) : null}
              </IconButton>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
                <p className="text-sm font-medium">Уведомления</p>
                <Button variant="ghost" size="sm" onClick={onReadAll} disabled={unread === 0}>
                  Прочитать все
                </Button>
              </div>
              <NotificationList items={notifications} onRead={onRead} />
            </PopoverContent>
          </Popover>
          <Button size="sm" className="ml-1" asChild>
            <Link href="#ember-profile">Войти</Link>
          </Button>
        </div>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" size="sm">
          <SheetHeader>
            <SheetTitle className="font-display">TwoMC</SheetTitle>
            <SheetDescription>Разделы сайта</SheetDescription>
          </SheetHeader>
          <SheetBody className="px-0">
            <nav aria-label="Разделы сайта">
              <ul className="flex flex-col">
                {NAV.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      aria-current={item.active ? 'page' : undefined}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        'flex h-11 items-center gap-3 border-l-2 px-5 text-sm transition-colors duration-fast',
                        item.active
                          ? 'border-primary bg-primary-soft/30 font-medium text-foreground'
                          : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <item.icon aria-hidden className="size-4" />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </SheetBody>
          <SheetFooter>
            <Button className="w-full" asChild>
              <Link href="#ember-profile" onClick={() => setMenuOpen(false)}>
                Войти
              </Link>
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </header>
  );
}

/* ------------------------------- Hero: табло онлайна ------------------------------ */

function Hero() {
  const online = useLiveValue(demoStats.usersOnline);
  const capacity = demoServers.reduce((sum, server) => sum + server.maxPlayers, 0);
  const occupied = demoServers.reduce((sum, server) => sum + server.players, 0);
  const fill = Math.round((occupied / capacity) * 100);

  return (
    <section
      aria-labelledby="ember-hero-title"
      className="relative border-b bg-[radial-gradient(ellipse_at_bottom,rgb(var(--primary)/0.25),transparent_60%)] px-4 pb-8 pt-10 md:px-6 md:pb-10 md:pt-14"
    >
      <h4 id="ember-hero-title" className="sr-only">
        Сейчас онлайн
      </h4>
      <p className="font-display text-6xl font-semibold leading-none tracking-tight text-primary tabular sm:text-7xl lg:text-8xl">
        <AnimatedCounter value={online} duration={1200} />
      </p>
      <p className="mt-3 text-lg md:text-xl">
        игроков сейчас на {formatNumber(demoServers.length)} серверах
      </p>

      <div className="mt-8 max-w-3xl">
        <div className="flex items-baseline justify-between gap-4 text-sm">
          <span className="text-muted-foreground">Заполненность серверов</span>
          <span className="font-mono text-muted-foreground tabular">
            {formatNumber(occupied)} / {formatNumber(capacity)} слотов
          </span>
        </div>
        <Progress value={fill} tone="primary" label="Заполненность серверов" className="mt-2" />
      </div>

      <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {demoServers.map((server) => (
          <li key={server.id}>
            <Link
              href="#ember-servers"
              className="inline-flex items-center gap-2 rounded-sm py-1 text-muted-foreground transition-colors duration-fast hover:text-foreground"
            >
              <span
                aria-hidden
                className={cn(
                  'size-1.5 rounded-full',
                  server.online ? 'bg-success' : 'bg-subtle-foreground',
                )}
              />
              <span className="font-medium text-foreground">{server.name}</span>
              <span className="font-mono tabular">
                {server.online
                  ? `${formatNumber(server.players)}/${formatNumber(server.maxPlayers)}`
                  : 'офлайн'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ----------------------------------- Сервера ---------------------------------- */

function ServersSection() {
  const onlineCount = demoServers.filter((server) => server.online).length;
  return (
    <section
      id="ember-servers"
      aria-labelledby="ember-servers-title"
      className="scroll-mt-16 px-4 py-10 md:px-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h4 id="ember-servers-title" className="font-display text-3xl md:text-4xl">
          Сервера
        </h4>
        <p className="text-sm text-muted-foreground tabular">
          {formatNumber(onlineCount)} из {formatNumber(demoServers.length)} онлайн
        </p>
      </div>
      <ul className="mt-6 divide-y border-y">
        {demoServers.map((server) => (
          <ServerRow key={server.id} server={server} />
        ))}
      </ul>
    </section>
  );
}

function ServerRow({ server }: { server: DemoServer }) {
  const fill = server.online ? Math.round((server.players / server.maxPlayers) * 100) : 0;
  const status = <StatusBadge status={server.online ? 'online' : 'offline'} />;
  return (
    <li className="flex flex-col gap-2 py-3 md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_4.5rem_4.5rem_auto] md:items-center md:gap-x-6">
      <div className="flex items-start justify-between gap-3 md:block">
        <div className="min-w-0">
          <h5 className="font-display text-base font-medium">{server.name}</h5>
          <p className="truncate text-sm text-muted-foreground">{server.motd}</p>
        </div>
        <span className="shrink-0 md:hidden">{status}</span>
      </div>
      <div className="flex items-center gap-3">
        <Progress
          value={fill}
          size="sm"
          tone="primary"
          label={`Заполненность ${server.name}`}
          className="max-w-44"
        />
        <span className="shrink-0 font-mono text-sm tabular">
          {formatNumber(server.players)}
          <span className="text-subtle-foreground">/{formatNumber(server.maxPlayers)}</span>
        </span>
      </div>
      <div className="flex gap-4 font-mono text-xs text-muted-foreground md:contents">
        <span>{server.version}</span>
        <span className="tabular">{server.pingMs !== null ? `${server.pingMs} мс` : '—'}</span>
      </div>
      <span className="hidden md:inline-flex md:justify-self-end">{status}</span>
    </li>
  );
}

/* -------------------------- Новости, события, магазин -------------------------- */

function FeedSection() {
  const [featured, ...rest] = demoNews;
  const featuredAuthor = userByName(featured.author);
  return (
    <section
      aria-label="Новости, события и магазин"
      className="grid gap-10 border-t px-4 py-10 md:px-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-12"
    >
      <div id="ember-news" className="scroll-mt-16">
        <div className="flex items-baseline justify-between gap-4">
          <h4 className="font-display text-3xl md:text-4xl">Новости</h4>
          <Link
            href="#ember-news"
            className="rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Все новости
          </Link>
        </div>
        <article className="mt-6 border-t pt-6">
          <h5 className="font-display text-2xl leading-tight md:text-3xl">
            <Link href="#ember-news" className="rounded-sm hover:text-primary-soft-foreground">
              {featured.title}
            </Link>
          </h5>
          <p className="mt-3 max-w-prose text-muted-foreground">{featured.excerpt}</p>
          <footer className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-subtle-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Avatar
                size="xs"
                shape="square"
                name={featured.author}
                src={featuredAuthor?.avatar}
              />
              {featured.author}
            </span>
            <time dateTime={featured.publishedAt}>{formatDate(featured.publishedAt)}</time>
            <span className="inline-flex items-center gap-1 tabular">
              <MessageSquare aria-hidden className="size-3.5" />
              {pluralRu(featured.comments, 'комментарий', 'комментария', 'комментариев')}
            </span>
          </footer>
        </article>
        <ul className="mt-2 divide-y border-t">
          {rest.map((news) => (
            <li key={news.id} className="py-4">
              <h5 className="font-display text-lg leading-snug">
                <Link href="#ember-news" className="rounded-sm hover:text-primary-soft-foreground">
                  {news.title}
                </Link>
              </h5>
              <p className="mt-1 text-sm text-muted-foreground">{news.excerpt}</p>
              <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-subtle-foreground">
                <span>{news.author}</span>
                <time dateTime={news.publishedAt}>{formatDate(news.publishedAt)}</time>
                <span className="inline-flex items-center gap-1 tabular">
                  <MessageSquare aria-hidden className="size-3" />
                  {formatNumber(news.comments)}
                </span>
              </p>
            </li>
          ))}
        </ul>
      </div>

      <aside className="flex flex-col gap-10">
        <div id="ember-events" className="scroll-mt-16">
          <h4 className="font-display text-2xl">События</h4>
          <ul className="mt-4 divide-y border-y">
            {demoEvents.map((event) => {
              const date = dateParts(event.startsAt);
              return (
                <li key={event.id} className="flex items-start gap-4 py-4">
                  <time
                    dateTime={event.startsAt}
                    className="flex w-14 shrink-0 flex-col items-center rounded border bg-surface py-1.5 edge-highlight"
                  >
                    <span className="font-display text-2xl leading-none tabular">{date.day}</span>
                    <span className="mt-1 text-xs text-muted-foreground">{date.month}</span>
                  </time>
                  <div className="min-w-0 flex-1">
                    <h5 className="font-display text-base leading-snug">
                      <Link
                        href="#ember-events"
                        className="rounded-sm hover:text-primary-soft-foreground"
                      >
                        {event.title}
                      </Link>
                    </h5>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatTime(event.startsAt)}, {event.server}
                    </p>
                    <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground tabular">
                      <Users aria-hidden className="size-4" />
                      {pluralRu(event.participants, 'участник', 'участника', 'участников')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-center"
                    onClick={() =>
                      toast.success('Вы участвуете', {
                        description: `${event.title}, ${formatDate(event.startsAt)} в ${formatTime(event.startsAt)}.`,
                      })
                    }
                  >
                    Участвовать
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>

        <div id="ember-store" className="scroll-mt-16">
          <h4 className="font-display text-2xl">Магазин</h4>
          <ProductCard product={demoProducts[0]} />
          <ul className="mt-3 divide-y border-y">
            {demoProducts.slice(1).map((product) => (
              <li key={product.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{product.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {product.type}, {product.period}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-sm tabular">
                  {formatMoney(product.price)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </section>
  );
}

function ProductCard({ product }: { product: DemoProduct }) {
  return (
    <article
      aria-labelledby={`ember-product-${product.id}`}
      className="mt-4 rounded-lg border bg-surface p-card-p edge-highlight"
    >
      <Badge tone="neutral">{product.type}</Badge>
      <h5 id={`ember-product-${product.id}`} className="mt-2 font-display text-xl leading-tight">
        {product.name}
      </h5>
      <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-display text-3xl tabular">{formatMoney(product.price)}</span>
        {product.oldPrice !== null ? (
          <s className="text-sm text-subtle-foreground tabular">{formatMoney(product.oldPrice)}</s>
        ) : null}
        <span className="text-sm text-muted-foreground">за {product.period}</span>
      </p>
      <div className="mt-5 flex gap-2">
        <Button
          className="flex-1"
          onClick={() =>
            toast.success('Добавлено в корзину', {
              description: `${product.name}, ${formatMoney(product.price)}.`,
            })
          }
        >
          Купить
        </Button>
        <Button variant="outline" asChild>
          <Link href="#ember-store">Подробнее</Link>
        </Button>
      </div>
    </article>
  );
}

/* --------------------------- Профиль и уведомления ---------------------------- */

function ProfileSection({ notifications, onRead, onReadAll }: NotificationsApi) {
  const user = demoUsers[1];
  const unread = notifications.filter((item) => !item.read).length;
  return (
    <section
      id="ember-profile"
      aria-label="Профиль и уведомления"
      className="grid scroll-mt-16 gap-6 border-t px-4 py-10 md:px-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
    >
      <ProfileCard user={user} />
      <section
        aria-labelledby="ember-notifications-title"
        className="flex min-w-0 flex-col rounded-lg border bg-surface edge-highlight"
      >
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <h4 id="ember-notifications-title" className="font-display text-lg">
              Уведомления
            </h4>
            {unread > 0 ? (
              <Badge tone="primary" className="tabular">
                {pluralRu(unread, 'новое', 'новых', 'новых')}
              </Badge>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" onClick={onReadAll} disabled={unread === 0}>
            Прочитать все
          </Button>
        </header>
        <NotificationList items={notifications} onRead={onRead} />
      </section>
    </section>
  );
}

function ProfileCard({ user }: { user: DemoUser }) {
  const [friendRequested, setFriendRequested] = useState(false);
  const slug = roleSlug(user);
  return (
    <article
      aria-labelledby="ember-profile-name"
      className="min-w-0 rounded-lg border bg-surface edge-highlight"
    >
      <div className="flex flex-col gap-5 p-card-p sm:flex-row sm:items-start">
        <Avatar name={user.username} src={user.avatar} size="xl" shape="square" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h4 id="ember-profile-name" className="font-display text-2xl leading-none md:text-3xl">
              {user.username}
            </h4>
            <StatusBadge status={user.online ? 'online' : 'offline'} />
          </div>
          <p className="mt-1.5 font-mono text-sm text-subtle-foreground">{user.tag}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {slug ? <RolePrefix slug={slug} name={user.role} size="sm" /> : null}
            <Badge color={user.roleColor}>{user.role}</Badge>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t pt-4">
            <div>
              <dt className="text-xs text-muted-foreground">Наиграно</dt>
              <dd className="mt-0.5 font-display text-xl tabular">
                {formatHours(user.playtimeHours)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">На проекте с</dt>
              <dd className="mt-0.5 font-display text-xl tabular">
                <time dateTime={user.joinedAt}>{formatDate(user.joinedAt)}</time>
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <footer className="flex flex-col gap-2 border-t p-4 sm:flex-row">
        <Button
          variant={friendRequested ? 'secondary' : 'primary'}
          disabled={friendRequested}
          onClick={() => {
            setFriendRequested(true);
            toast.success('Заявка отправлена', {
              description: `${user.username} получит уведомление.`,
            });
          }}
        >
          <UserPlus aria-hidden />
          {friendRequested ? 'Заявка отправлена' : 'Добавить в друзья'}
        </Button>
        <Button variant="secondary" asChild>
          <Link href="#ember-profile">
            <MessageSquare aria-hidden />
            Написать
          </Link>
        </Button>
      </footer>
    </article>
  );
}

function NotificationList({
  items,
  onRead,
}: {
  items: DemoNotification[];
  onRead: (id: string) => void;
}) {
  return (
    <ul className="divide-y">
      {items.map((item) => {
        const Icon = NOTIFICATION_ICON[item.kind];
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onRead(item.id)}
              className={cn(
                'flex w-full gap-3 border-l-2 px-4 py-3 text-left transition-colors duration-fast hover:bg-muted/60',
                item.read ? 'border-transparent' : 'border-primary',
              )}
            >
              <Icon
                aria-hidden
                className={cn(
                  'mt-0.5 size-4 shrink-0',
                  item.read ? 'text-subtle-foreground' : 'text-primary',
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className={cn('text-sm', !item.read && 'font-medium')}>
                    {item.title}
                    {!item.read ? <span className="sr-only">, непрочитано</span> : null}
                  </span>
                  <time
                    dateTime={item.at}
                    className="shrink-0 text-xs text-subtle-foreground tabular"
                  >
                    {formatRelative(item.at, DEMO_NOW)}
                  </time>
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{item.message}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------- Поиск (⌘K) ----------------------------------- */

function SearchPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const close = () => onOpenChange(false);
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Поиск по сайту">
      <CommandInput placeholder="Раздел, сервер или игрок" />
      <CommandList>
        <CommandEmpty />
        <CommandGroup heading="Разделы">
          {NAV.map((item) => (
            <CommandItem key={item.label} value={item.label} onSelect={close}>
              <item.icon aria-hidden />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Сервера">
          {demoServers.map((server) => (
            <CommandItem key={server.id} value={server.name} onSelect={close}>
              <Server aria-hidden />
              {server.name}
              <span className="ml-auto font-mono text-xs text-muted-foreground tabular">
                {server.online
                  ? `${formatNumber(server.players)}/${formatNumber(server.maxPlayers)}`
                  : 'офлайн'}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Игроки">
          {demoUsers.slice(0, 4).map((user) => (
            <CommandItem key={user.id} value={user.username} onSelect={close}>
              <Avatar name={user.username} src={user.avatar} size="xs" shape="square" />
              {user.username}
              <span className="ml-auto text-xs text-muted-foreground">{user.role}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
